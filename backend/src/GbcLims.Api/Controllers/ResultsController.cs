using System.Security.Claims;
using GbcLims.Api.Services;
using GbcLims.Domain.Entities;
using GbcLims.Domain.Enums;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ResultsController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly ILogger<ResultsController> _logger;

    public ResultsController(GbcLimsDbContext context, AuditLogService auditLogService, ILogger<ResultsController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    // The frontend refers to samples and results by their human-readable business
    // numbers (SampleNumber / AnalysisNumber), not the internal Guid primary keys.
    // Accept either everywhere an identifier comes in from a client.
    // Excludes soft-deleted samples: you can't submit a new result against a sample
    // that's been deleted, even though existing results keep their historical link.
    private async Task<Sample?> ResolveSampleAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Samples.FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted);
            if (byId is not null) return byId;
        }

        return await _context.Samples.FirstOrDefaultAsync(s => s.SampleNumber == identifier && !s.IsDeleted);
    }

    private async Task<Result?> ResolveResultAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Results.Include(r => r.Sample).Include(r => r.CreatedBy).FirstOrDefaultAsync(r => r.Id == guid);
            if (byId is not null) return byId;
        }

        return await _context.Results.Include(r => r.Sample).Include(r => r.CreatedBy).FirstOrDefaultAsync(r => r.AnalysisNumber == identifier);
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? sampleId, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        try
        {
            var query = _context.Results.Include(r => r.Sample).Include(r => r.CreatedBy).AsQueryable();
            if (!string.IsNullOrWhiteSpace(sampleId))
            {
                var sample = await ResolveSampleAsync(sampleId);
                if (sample is null) return Ok(new { items = Array.Empty<ResultDto>(), total = 0, page, pageSize });
                query = query.Where(r => r.SampleId == sample.Id);
            }

            var total = await query.CountAsync();
            var items = await query.OrderByDescending(r => r.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).Select(r => new ResultDto(r)).ToListAsync();
            return Ok(new { items, total, page, pageSize });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Results query failed");
            return StatusCode(500, new { message = "Unable to load results at the moment." });
        }
    }

    [HttpPost]
    [Authorize(Policy = "CanCreateRecords")]
    public async Task<IActionResult> Create([FromBody] CreateResultRequest request)
    {
        try
        {
            var sample = await ResolveSampleAsync(request.SampleId);
            if (sample is null) return NotFound();

            // Only Draft and Submitted are legal starting points — Approved/Rejected must
            // only ever be reached through UpdateStatus's review-decision path below.
            var initialStatus = ResultStatus.Submitted;
            if (!string.IsNullOrWhiteSpace(request.Status))
            {
                if (!Enum.TryParse<ResultStatus>(request.Status, true, out var parsedStatus) ||
                    (parsedStatus != ResultStatus.Draft && parsedStatus != ResultStatus.Submitted))
                {
                    return BadRequest(new { message = "Invalid initial status." });
                }
                initialStatus = parsedStatus;
            }

            var result = new Result
            {
                Id = Guid.NewGuid(),
                SampleId = sample.Id,
                Sample = sample,
                AnalysisNumber = request.AnalysisNumber,
                AnalysisDate = request.AnalysisDate,
                AnalystName = request.AnalystName,
                Method = request.Method,
                Equipment = request.Equipment,
                Moisture = request.Moisture,
                Al2O3 = request.Al2O3,
                SiO2 = request.SiO2,
                Fe2O3 = request.Fe2O3,
                TiO2 = request.TiO2,
                Loi = request.Loi,
                Cao = request.Cao,
                Mgo = request.Mgo,
                Na2O = request.Na2O,
                K2O = request.K2O,
                P2O5 = request.P2O5,
                MnO = request.MnO,
                Cr2O3 = request.Cr2O3,
                TotalOxides = request.TotalOxides,
                Asr = request.Asr,
                Rr = request.Rr,
                Calibrated = request.Calibrated,
                StandardDeviation = request.StandardDeviation,
                Repeatability = request.Repeatability,
                Notes = request.Notes,
                Status = initialStatus,
                CreatedById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString())
            };

            _context.Results.Add(result);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Create", "Result", nameof(Result), result.Id.ToString(), "Result entered", result.CreatedById, User.Identity?.Name, result.SampleId);
            var dto = new ResultDto(result) { CreatedBy = User.FindFirst("staffId")?.Value ?? string.Empty };
            return CreatedAtAction(nameof(Get), new { sampleId = result.SampleId }, dto);
        }
        // AnalysisNumber is generated client-side from the trailing digits of
        // Date.now(), which repeats every ~16.7 minutes — a real, if infrequent,
        // collision risk. Called out separately so the user gets an actionable message.
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex, "Result create failed due to a duplicate AnalysisNumber");
            return Conflict(new { message = "This Result ID is already in use. Please try submitting again." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Result create failed");
            return StatusCode(500, new { message = "Unable to submit result at the moment." });
        }
    }

    [HttpPatch("{id}/status")]
    [Authorize]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateResultStatusRequest request)
    {
        try
        {
            var result = await ResolveResultAsync(id);
            if (result is null) return NotFound();

            if (!Enum.TryParse<ResultStatus>(request.Status, true, out var nextStatus)) return BadRequest();

            var allowedTransitions = new Dictionary<ResultStatus, List<ResultStatus>>
            {
                [ResultStatus.Draft] = new() { ResultStatus.Submitted },
                [ResultStatus.Submitted] = new() { ResultStatus.Approved, ResultStatus.Rejected },
                [ResultStatus.Approved] = new() { ResultStatus.Approved },
                [ResultStatus.Rejected] = new() { ResultStatus.Rejected }
            };
            if (!allowedTransitions[result.Status].Contains(nextStatus)) return BadRequest(new { message = "Invalid status transition" });

            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSelfSubmit = result.Status == ResultStatus.Draft && nextStatus == ResultStatus.Submitted;

            if (isSelfSubmit)
            {
                // Submitting your own draft is a continuation of creating it, not a review
                // decision — gated the same way as creating a result in the first place.
                if (result.CreatedById != userId || role is not ("admin" or "xrf_chemist" or "bauxite_engineer"))
                {
                    return StatusCode(403, new { message = "Only the result's creator can submit their own draft." });
                }
                result.Status = nextStatus;
            }
            else
            {
                // Approve/reject is a review decision: gated to approve-capable roles, and
                // segregated so the same person who created a result can't also review it.
                if (role is not ("admin" or "bauxite_engineer" or "qa_engineer"))
                {
                    return StatusCode(403, new { message = "You do not have permission to update this result." });
                }
                // Admin is exempt from the self-approval block below — every other
                // approve-capable role still can't review their own submission.
                if (result.CreatedById == userId && role != "admin")
                {
                    return StatusCode(403, new { message = "You cannot approve or reject a result you submitted yourself." });
                }
                result.Status = nextStatus;
                result.ApprovalComment = request.Comment;
                result.ApprovedById = userId;
            }

            result.UpdatedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Update", "Result", nameof(Result), result.Id.ToString(), $"Result status changed to {nextStatus}", userId, User.Identity?.Name, result.SampleId);
            return Ok(new ResultDto(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Result status update failed for id {ResultId}", id);
            return StatusCode(500, new { message = "Unable to update result status at the moment." });
        }
    }

    public record CreateResultRequest(string SampleId, string AnalysisNumber, DateTimeOffset AnalysisDate, string AnalystName, string Method, string Equipment, decimal Moisture, decimal Al2O3, decimal SiO2, decimal Fe2O3, decimal TiO2, decimal Loi, decimal Cao, decimal Mgo, decimal Na2O, decimal K2O, decimal? P2O5, decimal? MnO, decimal? Cr2O3, decimal TotalOxides, decimal Asr, decimal Rr, bool Calibrated, decimal? StandardDeviation, string? Repeatability, string Notes, string? Status);
    public record UpdateResultStatusRequest(string Status, string? Comment);

    public class ResultDto
    {
        public ResultDto() { }
        public ResultDto(Result result)
        {
            Id = result.Id;
            SampleId = result.Sample?.SampleNumber ?? result.SampleId.ToString();
            AnalysisNumber = result.AnalysisNumber;
            AnalysisDate = result.AnalysisDate;
            AnalystName = result.AnalystName;
            Method = result.Method;
            Equipment = result.Equipment;
            Moisture = result.Moisture;
            Al2O3 = result.Al2O3;
            SiO2 = result.SiO2;
            Fe2O3 = result.Fe2O3;
            TiO2 = result.TiO2;
            Loi = result.Loi;
            Cao = result.Cao;
            Mgo = result.Mgo;
            Na2O = result.Na2O;
            K2O = result.K2O;
            P2O5 = result.P2O5;
            MnO = result.MnO;
            Cr2O3 = result.Cr2O3;
            TotalOxides = result.TotalOxides;
            Asr = result.Asr;
            Rr = result.Rr;
            Calibrated = result.Calibrated;
            StandardDeviation = result.StandardDeviation;
            Repeatability = result.Repeatability;
            Notes = result.Notes;
            Status = result.Status.ToString();
            CreatedBy = result.CreatedBy?.StaffId ?? string.Empty;
        }

        public Guid Id { get; set; }
        public string SampleId { get; set; } = string.Empty;
        public string AnalysisNumber { get; set; } = string.Empty;
        public DateTimeOffset AnalysisDate { get; set; }
        public string AnalystName { get; set; } = string.Empty;
        public string Method { get; set; } = string.Empty;
        public string Equipment { get; set; } = string.Empty;
        public decimal Moisture { get; set; }
        public decimal Al2O3 { get; set; }
        public decimal SiO2 { get; set; }
        public decimal Fe2O3 { get; set; }
        public decimal TiO2 { get; set; }
        public decimal Loi { get; set; }
        public decimal Cao { get; set; }
        public decimal Mgo { get; set; }
        public decimal Na2O { get; set; }
        public decimal K2O { get; set; }
        public decimal? P2O5 { get; set; }
        public decimal? MnO { get; set; }
        public decimal? Cr2O3 { get; set; }
        public decimal TotalOxides { get; set; }
        public decimal Asr { get; set; }
        public decimal Rr { get; set; }
        public bool Calibrated { get; set; }
        public decimal? StandardDeviation { get; set; }
        public string? Repeatability { get; set; }
        public string Notes { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string CreatedBy { get; set; } = string.Empty;
    }
}
