using System.Security.Claims;
using GbcLims.Api.Services;
using GbcLims.Domain.Entities;
using GbcLims.Domain.Enums;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
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
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<ResultsController> _logger;

    public ResultsController(GbcLimsDbContext context, AuditLogService auditLogService, UserManager<ApplicationUser> userManager, ILogger<ResultsController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _userManager = userManager;
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

    // AnalysisNumber is allocated here, from a real Postgres sequence, instead of the
    // old client-side `RES-${Date.now().slice(-6)}` scheme, which repeated every ~16.7
    // minutes. The InMemory provider (local dev without Postgres configured) has no
    // sequences, so it falls back to a millisecond-based value — fine for a single-user
    // dev box, not relied on for real uniqueness guarantees there.
    private async Task<string> GenerateAnalysisNumberAsync()
    {
        long value = _context.Database.IsRelational()
            ? await _context.Database.SqlQueryRaw<long>("SELECT nextval('result_analysis_number_seq')").FirstAsync()
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % 1_000_000;
        return $"RES-{value:D6}";
    }

    private string CurrentUserDisplayName => User.FindFirst("fullName")?.Value ?? User.FindFirst("staffId")?.Value ?? User.Identity?.Name ?? "Unknown";

    private static bool TryValidateOxideRange(string name, decimal? value, out string? error)
    {
        error = null;
        if (value is null) return true;
        if (value < 0 || value > 100)
        {
            error = $"{name} must be between 0 and 100.";
            return false;
        }
        return true;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? sampleId, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        try
        {
            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 1, 200);
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

            // Composite result: this one analysis represents the primary sample above
            // plus these others (coning-and-quartering several registered samples down
            // into a single physical unit before analysis). Duplicates and the primary
            // itself are dropped — the frontend sends every selected sample including
            // the primary, so this list is exactly "everything else that was selected".
            string? additionalSampleNumbers = null;
            if (request.AdditionalSampleIds is { Count: > 0 })
            {
                var additionalSamples = new List<Sample>();
                foreach (var identifier in request.AdditionalSampleIds.Distinct())
                {
                    var additional = await ResolveSampleAsync(identifier);
                    if (additional is null) return BadRequest(new { message = $"Sample '{identifier}' was not found." });
                    if (additional.Id != sample.Id) additionalSamples.Add(additional);
                }
                if (additionalSamples.Count > 0) additionalSampleNumbers = string.Join(",", additionalSamples.Select(s => s.SampleNumber));
            }

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

            // The browser calculates and sends TotalOxides/Asr/Rr too (for instant
            // on-screen feedback as the chemist types), but none of its values are
            // trusted here — anyone calling the API directly could otherwise store any
            // numbers. Recomputed server-side from the raw oxide readings using the same
            // formulas as ResultsEntry.jsx (src/pages/FeaturePages.jsx).
            var oxideChecks = new (string Name, decimal? Value)[]
            {
                ("Al2O3", request.Al2O3), ("SiO2", request.SiO2), ("Fe2O3", request.Fe2O3), ("TiO2", request.TiO2),
                ("LOI", request.Loi), ("CaO", request.Cao), ("MgO", request.Mgo), ("Na2O", request.Na2O),
                ("K2O", request.K2O), ("P2O5", request.P2O5), ("MnO", request.MnO), ("Cr2O3", request.Cr2O3),
                ("Minor oxides", request.MinorOxides)
            };
            foreach (var (name, value) in oxideChecks)
            {
                if (!TryValidateOxideRange(name, value, out var error)) return BadRequest(new { message = error });
            }

            var totalOxides = Math.Round(
                request.Al2O3 + request.SiO2 + request.Fe2O3 + request.TiO2 + request.Loi + request.Cao + request.Mgo + request.Na2O + request.K2O
                + (request.P2O5 ?? 0) + (request.MnO ?? 0) + (request.Cr2O3 ?? 0) + (request.MinorOxides ?? 0), 2);
            if (totalOxides < 95 || totalOxides > 105)
            {
                return BadRequest(new { message = $"Total oxides ({totalOxides}%) is outside the acceptable 95-105% range. Check the entered values." });
            }
            var asr = request.SiO2 > 0 ? Math.Round(request.Al2O3 / request.SiO2, 2) : 0;
            var rr = (request.SiO2 + request.Fe2O3) > 0 ? Math.Round(request.Al2O3 / (request.SiO2 + request.Fe2O3), 2) : 0;

            var createdById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());

            var result = new Result
            {
                Id = Guid.NewGuid(),
                SampleId = sample.Id,
                Sample = sample,
                AdditionalSampleNumbers = additionalSampleNumbers,
                AnalysisNumber = await GenerateAnalysisNumberAsync(),
                AnalysisDate = request.AnalysisDate,
                // Taken from the logged-in user's own claims, not the request body — the
                // browser used to send whatever name was in the form, so a result could
                // claim any analyst.
                AnalystName = CurrentUserDisplayName,
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
                MinorOxides = request.MinorOxides,
                TotalOxides = totalOxides,
                Asr = asr,
                Rr = rr,
                Calibrated = request.Calibrated,
                StandardDeviation = request.StandardDeviation,
                Repeatability = request.Repeatability,
                Notes = request.Notes,
                Status = initialStatus,
                CreatedById = createdById
            };

            _context.Results.Add(result);
            _auditLogService.Log("Create", "Result", nameof(Result), result.Id.ToString(), "Result entered", result.CreatedById, User.Identity?.Name, result.SampleId, newValues: new { result.AnalysisNumber, result.Al2O3, result.SiO2, result.Fe2O3, result.TiO2, result.Loi, result.TotalOxides });
            await _context.SaveChangesAsync();
            var dto = new ResultDto(result) { CreatedBy = User.FindFirst("staffId")?.Value ?? string.Empty };
            return CreatedAtAction(nameof(Get), new { sampleId = result.SampleId }, dto);
        }
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
                // Rejected -> Draft is the correction path: a rejected result is no
                // longer a dead end — its creator can amend and resubmit it, with the
                // correction reasoned and audited like any other edit.
                [ResultStatus.Rejected] = new() { ResultStatus.Rejected, ResultStatus.Draft }
            };
            if (!allowedTransitions[result.Status].Contains(nextStatus)) return BadRequest(new { message = "Invalid status transition" });

            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSelfSubmit = result.Status == ResultStatus.Draft && nextStatus == ResultStatus.Submitted;
            var isCorrection = result.Status == ResultStatus.Rejected && nextStatus == ResultStatus.Draft;
            var previousStatus = result.Status;

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
            else if (isCorrection)
            {
                if (result.CreatedById != userId)
                {
                    return StatusCode(403, new { message = "Only the result's creator can amend a rejected result." });
                }
                if (string.IsNullOrWhiteSpace(request.Comment))
                {
                    return BadRequest(new { message = "A reason is required to amend a rejected result." });
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
                // No exemption for admin — segregation of duties applies to every
                // approve-capable role equally, with no one able to review their own
                // submission regardless of privilege level.
                if (result.CreatedById == userId)
                {
                    return StatusCode(403, new { message = "You cannot approve or reject a result you submitted yourself." });
                }

                // E-signature: re-entering the current password at the moment of
                // approval/rejection, not just relying on an already-open session, is
                // what makes this attributable as a deliberate signing act rather than
                // "whoever happened to be logged in."
                var currentUser = await _userManager.FindByIdAsync(userId.ToString());
                if (currentUser is null || string.IsNullOrWhiteSpace(request.Password) || !await _userManager.CheckPasswordAsync(currentUser, request.Password))
                {
                    return StatusCode(401, new { message = "Incorrect password. Re-enter your password to confirm this decision." });
                }

                result.Status = nextStatus;
                result.ApprovalComment = request.Comment;
                result.ApprovedById = userId;
            }

            result.UpdatedAt = DateTimeOffset.UtcNow;
            var statusMessage = $"Result status changed to {nextStatus}";
            _auditLogService.Log("Update", "Result", nameof(Result), result.Id.ToString(), statusMessage, userId, User.Identity?.Name, result.SampleId, request.Comment, new { Status = previousStatus.ToString() }, new { Status = nextStatus.ToString() });
            await _context.SaveChangesAsync();
            return Ok(new ResultDto(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Result status update failed for id {ResultId}", id);
            return StatusCode(500, new { message = "Unable to update result status at the moment." });
        }
    }

    // AnalysisNumber, AnalystName, TotalOxides, Asr, and Rr are deliberately absent —
    // all five are now allocated/computed server-side (see Create above) rather than
    // trusted from the client.
    public record CreateResultRequest(string SampleId, DateTimeOffset AnalysisDate, string Method, string Equipment, decimal Moisture, decimal Al2O3, decimal SiO2, decimal Fe2O3, decimal TiO2, decimal Loi, decimal Cao, decimal Mgo, decimal Na2O, decimal K2O, decimal? P2O5, decimal? MnO, decimal? Cr2O3, decimal? MinorOxides, bool Calibrated, decimal? StandardDeviation, string? Repeatability, string Notes, string? Status, List<string>? AdditionalSampleIds = null);
    public record UpdateResultStatusRequest(string Status, string? Comment, string? Password = null);

    public class ResultDto
    {
        public ResultDto() { }
        public ResultDto(Result result)
        {
            Id = result.Id;
            SampleId = result.Sample?.SampleNumber ?? result.SampleId.ToString();
            SampleNumbers = string.IsNullOrWhiteSpace(result.AdditionalSampleNumbers)
                ? new List<string> { SampleId }
                : new List<string> { SampleId }.Concat(result.AdditionalSampleNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries)).ToList();
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
            MinorOxides = result.MinorOxides;
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
        // SampleId plus any others this one analysis represents (composite/quartered
        // samples). Always at least [SampleId] — the common single-sample case.
        public List<string> SampleNumbers { get; set; } = new();
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
        public decimal? MinorOxides { get; set; }
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
