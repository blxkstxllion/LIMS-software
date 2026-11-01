using GbcLims.Domain.Enums;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

// Server-side aggregation for the dashboard, replacing the fake/hardcoded chart data
// that used to live in Dashboard.jsx and the totals that were silently wrong once a
// lab had more than one page (25 records) of samples — fetchLimsData() loaded only
// the first page and the dashboard computed "totals" from that partial list.
[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(GbcLimsDbContext context, ILogger<DashboardController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        try
        {
            var samples = await _context.Samples
                .Where(s => !s.IsDeleted)
                .Select(s => new { s.CreatedAt, s.UpdatedAt, s.Status })
                .ToListAsync();

            var pendingStatuses = new[] { SampleStatus.PendingRegistration, SampleStatus.PendingVerification, SampleStatus.PendingAnalysis };
            var totalSamples = samples.Count;
            var pendingSamples = samples.Count(s => pendingStatuses.Contains(s.Status));
            var inProgressSamples = samples.Count(s => s.Status == SampleStatus.InProgress);
            var completedSamples = samples.Count(s => s.Status == SampleStatus.Completed || s.Status == SampleStatus.Approved);
            var rejectedSamples = samples.Count(s => s.Status == SampleStatus.Rejected);
            var pendingApprovalResults = await _context.Results.CountAsync(r => r.Status == ResultStatus.Submitted);

            // Last 7 calendar days (UTC), oldest first — day-bucketed in memory since the
            // table is small; "samples" = registered that day, "completed" = moved to
            // Completed/Approved that day (proxied by UpdatedAt, since sample status
            // transitions aren't individually timestamped).
            var today = DateTimeOffset.UtcNow.Date;
            var last7Days = Enumerable.Range(0, 7).Select(offset =>
            {
                var date = today.AddDays(-6 + offset);
                return new DailyStatsDto
                {
                    Date = date,
                    Day = date.ToString("ddd"),
                    SamplesRegistered = samples.Count(s => s.CreatedAt.Date == date),
                    SamplesCompleted = samples.Count(s => s.UpdatedAt.Date == date && (s.Status == SampleStatus.Completed || s.Status == SampleStatus.Approved))
                };
            }).ToList();

            return Ok(new DashboardStatsDto
            {
                TotalSamples = totalSamples,
                PendingSamples = pendingSamples,
                InProgressSamples = inProgressSamples,
                CompletedSamples = completedSamples,
                RejectedSamples = rejectedSamples,
                PendingApprovalResults = pendingApprovalResults,
                Last7Days = last7Days
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Dashboard stats query failed");
            return StatusCode(500, new { message = "Unable to load dashboard stats at the moment." });
        }
    }

    public class DashboardStatsDto
    {
        public int TotalSamples { get; set; }
        public int PendingSamples { get; set; }
        public int InProgressSamples { get; set; }
        public int CompletedSamples { get; set; }
        public int RejectedSamples { get; set; }
        public int PendingApprovalResults { get; set; }
        public List<DailyStatsDto> Last7Days { get; set; } = new();
    }

    public class DailyStatsDto
    {
        public DateTimeOffset Date { get; set; }
        public string Day { get; set; } = string.Empty;
        public int SamplesRegistered { get; set; }
        public int SamplesCompleted { get; set; }
    }
}
