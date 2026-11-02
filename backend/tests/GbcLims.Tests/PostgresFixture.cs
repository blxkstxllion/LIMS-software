using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace GbcLims.Tests;

// One real Postgres container for the whole test run (starting it is the slow part,
// a few seconds; shared via xUnit's collection fixture so every test class pays that
// cost once, not per test). Each test gets its own freshly-created, empty database
// within that one container — fast to create, fully isolated from other tests, and
// migrated with the project's real migrations (including the raw SQL ones — the
// append-only trigger, the number sequences) instead of EF Core's InMemory provider,
// which silently skips anything that isn't plain relational DDL.
public class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("gbclims_test")
        .WithUsername("gbclims_test")
        .WithPassword("gbclims_test")
        .Build();

    public Task InitializeAsync() => _container.StartAsync();

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    // Connects to the container's own maintenance database to CREATE a fresh,
    // separate database, then returns a connection string pointed at that new one —
    // callers never touch the container's default "gbclims_test" database directly.
    public async Task<string> CreateDatabaseAsync(string name)
    {
        await using var connection = new NpgsqlConnection(_container.GetConnectionString());
        await connection.OpenAsync();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = $"CREATE DATABASE \"{name}\"";
            await command.ExecuteNonQueryAsync();
        }

        var builder = new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = name };
        return builder.ConnectionString;
    }
}

[CollectionDefinition("Postgres")]
public class PostgresCollection : ICollectionFixture<PostgresFixture>
{
}
