using System.Security.Claims;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(GbcLimsDbContext context, ILogger<NotificationsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // Derived from the existing audit trail rather than a separate notifications table:
    // a notification is "someone else changed the status of a sample I registered, or a
    // result I submitted." Sample and Result audit entries both carry SampleId (see
    // SamplesController/ResultsController's LogAsync calls), but only Sample entries are
    // guaranteed to belong to the sample's own creator — a result can be entered by a
    // different person than whoever registered the sample, so Result ownership is
    // resolved separately via the Result row itself, not assumed from the sample.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<NotificationDto>>> Get()
    {
        try
        {
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var since = DateTimeOffset.UtcNow.AddDays(-14);

            var recentLogs = await _context.AuditLogs
                .Where(l => (l.Module == "Sample" || l.Module == "Result") && l.Action == "Update" && l.UserId != userId && l.CreatedAt >= since)
                .OrderByDescending(l => l.CreatedAt)
                .Take(200)
                .ToListAsync();

            var sampleLogs = recentLogs.Where(l => l.Module == "Sample" && l.SampleId.HasValue).ToList();
            var mySampleIds = (await _context.Samples
                .Where(s => s.CreatedById == userId && sampleLogs.Select(l => l.SampleId!.Value).Contains(s.Id))
                .Select(s => new { s.Id, s.SampleNumber })
                .ToListAsync())
                .ToDictionary(s => s.Id, s => s.SampleNumber);

            var resultLogs = recentLogs.Where(l => l.Module == "Result" && l.EntityId != null).ToList();
            var resultGuids = resultLogs.Select(l => Guid.TryParse(l.EntityId, out var g) ? g : (Guid?)null).Where(g => g.HasValue).Select(g => g!.Value).ToList();
            var myResults = (await _context.Results
                .Where(r => r.CreatedById == userId && resultGuids.Contains(r.Id))
                .Select(r => new { r.Id, r.AnalysisNumber })
                .ToListAsync())
                .ToDictionary(r => r.Id.ToString(), r => r.AnalysisNumber);

            var notifications = new List<NotificationDto>();
            foreach (var log in sampleLogs)
            {
                if (mySampleIds.TryGetValue(log.SampleId!.Value, out var sampleNumber))
                {
                    notifications.Add(new NotificationDto { Id = log.Id, Message = $"Sample {sampleNumber}: {log.Details}", ActorName = log.UserName, CreatedAt = log.CreatedAt });
                }
            }
            foreach (var log in resultLogs)
            {
                if (log.EntityId is not null && myResults.TryGetValue(log.EntityId, out var analysisNumber))
                {
                    notifications.Add(new NotificationDto { Id = log.Id, Message = $"Result {analysisNumber}: {log.Details}", ActorName = log.UserName, CreatedAt = log.CreatedAt });
                }
            }

            return Ok(notifications.OrderByDescending(n => n.CreatedAt).Take(30));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Notifications query failed");
            return StatusCode(500, new { message = "Unable to load notifications at the moment." });
        }
    }

    public class NotificationDto
    {
        public Guid Id { get; set; }
        public string Message { get; set; } = string.Empty;
        public string ActorName { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; }
    }
}
