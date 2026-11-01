using GbcLims.Infrastructure.Persistence;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace GbcLims.Api.Services;

// A plain CanConnectAsync, not the AspNetCore.HealthChecks.NpgSql package — that
// package is a thin wrapper around the same call, and pulling in a new NuGet
// dependency for one method call isn't worth it.
public class DatabaseHealthCheck : IHealthCheck
{
    private readonly GbcLimsDbContext _context;

    public DatabaseHealthCheck(GbcLimsDbContext context)
    {
        _context = context;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var canConnect = await _context.Database.CanConnectAsync(cancellationToken);
            return canConnect ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Cannot connect to the database");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Database health check threw", ex);
        }
    }
}
