using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace GbcLims.Tests;

[Collection("Postgres")]
public class AuthFlowTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _rawFactory;
    private readonly PostgresFixture _postgres;
    private WebApplicationFactory<Program> _factory = null!;

    public AuthFlowTests(WebApplicationFactory<Program> factory, PostgresFixture postgres)
    {
        _rawFactory = factory;
        _postgres = postgres;

        // Program.cs reads Jwt:Secret into a local variable before builder.Build() runs
        // (to configure JWT Bearer validation), which is before WithWebHostBuilder's
        // ConfigureAppConfiguration override gets layered in — so a config-override
        // approach here would sign tokens with one secret and validate them against
        // another. An environment variable is visible from the very first line of
        // Program.cs, so both the early (validation setup) and late (per-request
        // signing) reads agree. Tests supply their own so they don't depend on
        // `dotnet user-secrets` being configured on whatever machine runs them.
        Environment.SetEnvironmentVariable("Jwt__Secret", "test-only-secret-never-used-outside-automated-tests-0123456789");
    }

    // A real Postgres database (via PostgresFixture, Testcontainers), migrated with the
    // project's actual migrations — not EF Core's InMemory provider, which silently
    // no-ops anything that isn't plain relational DDL (the append-only trigger, the
    // number sequences, HasFilter unique indexes). The seeded Development test
    // accounts this suite logs in with are created by Program.cs's own startup code
    // against this same real schema, exactly as a real deployment's Migrate() would.
    public async Task InitializeAsync()
    {
        var connectionString = await _postgres.CreateDatabaseAsync($"authflowtests_{Guid.NewGuid():N}");

        _factory = _rawFactory.WithWebHostBuilder(builder =>
        {
            // Seeding of the test accounts this suite logs in with is gated to
            // Development (never runs in a real deployment); pin the test host there
            // explicitly rather than relying on whatever ASPNETCORE_ENVIRONMENT the
            // test runner happens to have set.
            builder.UseEnvironment("Development");

            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["EnableHttpsRedirection"] = "false"
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<GbcLimsDbContext>>();
                services.RemoveAll<GbcLimsDbContext>();
                services.AddDbContext<GbcLimsDbContext>(options => options.UseNpgsql(connectionString));
            });
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Login_And_AccessProtectedEndpoints_Work()
    {
        using var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new { staffId = "ADMIN", password = "Test1234" });
        var loginBody = await loginResponse.Content.ReadAsStringAsync();
        Assert.True(loginResponse.IsSuccessStatusCode, loginBody);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.False(string.IsNullOrWhiteSpace(auth!.AccessToken));

        var endpointDataSource = _factory.Services.GetRequiredService<EndpointDataSource>();
        var endpoints = endpointDataSource.Endpoints.OfType<RouteEndpoint>().Where(e => e.RoutePattern.RawText?.Contains("samples", StringComparison.OrdinalIgnoreCase) == true).ToList();
        Console.WriteLine($"Registered sample endpoints: {string.Join(", ", endpoints.Select(e => e.RoutePattern.RawText ?? "<null>"))}");
        Assert.NotEmpty(endpoints);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var samplesResponse = await client.GetAsync("/api/Samples");
        var samplesBody = await samplesResponse.Content.ReadAsStringAsync();
        Console.WriteLine($"Samples response: {(int)samplesResponse.StatusCode} {samplesBody}");

        Assert.Equal(HttpStatusCode.OK, samplesResponse.StatusCode);
    }

    private sealed class AuthResponse
    {
        public string AccessToken { get; set; } = string.Empty;
    }
}
