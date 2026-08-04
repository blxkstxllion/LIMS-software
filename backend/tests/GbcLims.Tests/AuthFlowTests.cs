using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace GbcLims.Tests;

public class AuthFlowTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AuthFlowTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
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
                services.AddDbContext<GbcLimsDbContext>(options => options.UseInMemoryDatabase("AuthFlowTests"));
            });
        });
    }

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
        public string RefreshToken { get; set; } = string.Empty;
    }
}
