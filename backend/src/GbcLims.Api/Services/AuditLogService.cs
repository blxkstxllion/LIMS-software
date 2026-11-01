using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;

namespace GbcLims.Api.Services;

public class AuditLogService
{
    private readonly GbcLimsDbContext _context;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuditLogService(GbcLimsDbContext context, IHttpContextAccessor httpContextAccessor)
    {
        _context = context;
        _httpContextAccessor = httpContextAccessor;
    }

    // No SaveChangesAsync here — the caller is expected to wrap its own entity change
    // and this call in one BeginTransactionAsync/CommitAsync pair (see e.g.
    // SamplesController.Update), so the audit row and the change it records commit or
    // roll back together instead of as two independent writes.
    public void Log(string action, string module, string entityType, string? entityId, string details, Guid? userId, string? userName, Guid? sampleId = null, string? reason = null, object? oldValues = null, object? newValues = null)
    {
        var ipAddress = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
        var log = new AuditLog
        {
            Id = Guid.NewGuid(),
            Action = action,
            Module = module,
            EntityType = entityType,
            EntityId = entityId,
            Details = details,
            Reason = reason,
            OldValues = oldValues is null ? null : System.Text.Json.JsonSerializer.Serialize(oldValues),
            NewValues = newValues is null ? null : System.Text.Json.JsonSerializer.Serialize(newValues),
            UserName = userName ?? "system",
            IpAddress = ipAddress,
            UserId = userId,
            SampleId = sampleId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.AuditLogs.Add(log);
    }

    // Kept for call sites not yet migrated to an explicit transaction — saves
    // immediately, same as before. Prefer Log() + the caller's own transaction/
    // SaveChangesAsync for anything recording a change to another entity.
    public async Task LogAsync(string action, string module, string entityType, string? entityId, string details, Guid? userId, string? userName, Guid? sampleId = null, string? reason = null, object? oldValues = null, object? newValues = null)
    {
        Log(action, module, entityType, entityId, details, userId, userName, sampleId, reason, oldValues, newValues);
        await _context.SaveChangesAsync();
    }
}
