using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuditLogsController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly ILogger<AuditLogsController> _logger;

    public AuditLogsController(GbcLimsDbContext context, ILogger<AuditLogsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // The full, unfiltered log is admin-only (it's a system-wide audit trail). Scoped to
    // a single sample, it's just that sample's own history — anyone who can already see
    // the sample can see this, same as any other page-level permission in the app.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AuditLogDto>>> Get([FromQuery] int limit = 100, [FromQuery] string? sampleId = null)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sampleId) && User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value != "admin")
            {
                return StatusCode(403, new { message = "Only admins can view the full audit log." });
            }

            var query = _context.AuditLogs.AsQueryable();
            if (!string.IsNullOrWhiteSpace(sampleId))
            {
                Sample? sample = Guid.TryParse(sampleId, out var guid)
                    ? await _context.Samples.FirstOrDefaultAsync(s => s.Id == guid)
                    : await _context.Samples.FirstOrDefaultAsync(s => s.SampleNumber == sampleId);
                if (sample is null) return Ok(Array.Empty<AuditLogDto>());
                query = query.Where(l => l.SampleId == sample.Id);
            }

            var logs = await query
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
                Details = l.Details,
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
        public string Details { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
    }
}
