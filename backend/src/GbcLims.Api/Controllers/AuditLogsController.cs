using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "admin")]
public class AuditLogsController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly ILogger<AuditLogsController> _logger;

    public AuditLogsController(GbcLimsDbContext context, ILogger<AuditLogsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditLogDto>>> Get([FromQuery] int limit = 100)
    {
        try
        {
            var logs = await _context.AuditLogs
                .OrderByDescending(l => l.CreatedAt)
                .Take(Math.Clamp(limit, 1, 500))
                .ToListAsync();

            return Ok(logs.Select(l => new AuditLogDto
            {
                Id = l.Id,
                Timestamp = l.CreatedAt,
                UserName = l.UserName,
                Action = l.Action,
                Module = l.Module,
                RecordId = l.EntityId ?? string.Empty,
                IpAddress = l.IpAddress ?? string.Empty
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Audit log query failed");
            return StatusCode(500, new { message = "Unable to load audit logs at the moment." });
        }
    }

    public class AuditLogDto
    {
        public Guid Id { get; set; }
        public DateTimeOffset Timestamp { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string Module { get; set; } = string.Empty;
        public string RecordId { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
    }
}
