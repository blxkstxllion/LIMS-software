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

    public async Task LogAsync(string action, string module, string entityType, string? entityId, string details, Guid? userId, string? userName, Guid? sampleId = null)
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
            UserName = userName ?? "system",
            IpAddress = ipAddress,
            UserId = userId,
            SampleId = sampleId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _context.AuditLogs.Add(log);
        await _context.SaveChangesAsync();
    }
}
