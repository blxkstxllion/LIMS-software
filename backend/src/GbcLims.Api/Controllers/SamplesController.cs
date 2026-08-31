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
public class SamplesController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly ILogger<SamplesController> _logger;

    public SamplesController(GbcLimsDbContext context, AuditLogService auditLogService, ILogger<SamplesController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    // The frontend treats the human-readable SampleNumber (e.g. "GBC-2025-100001") as the
    // sample's identifier everywhere, not the internal Guid primary key. Accept either.
    // Soft-deleted samples are excluded: once deleted, a sample can no longer be looked
    // up, edited, or deleted again, even though its row (and its historical results/COAs/
    // audit trail) still exists.
    private async Task<Sample?> ResolveSampleAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Samples.Include(s => s.CreatedBy).FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted);
            if (byId is not null) return byId;
        }

        return await _context.Samples.Include(s => s.CreatedBy).FirstOrDefaultAsync(s => s.SampleNumber == identifier && !s.IsDeleted);
    }

    // SampleDto renders status as spaced words ("Pending Verification") to match the
    // frontend's status-badge colors and exact-match filters (Sample Verification's
    // queue, Results Entry's available-samples list) — both were written against that
    // human-readable form, not the bare enum name. Accepting the same spaced form back
    // here (in addition to the unspaced enum name, for any other caller) means a status
    // string round-tripped from a GET response always parses correctly on the way back in.
    private static bool TryParseSampleStatus(string? value, out SampleStatus status)
        => Enum.TryParse(value?.Replace(" ", ""), true, out status);

    private static string FormatSampleStatus(SampleStatus status)
        => System.Text.RegularExpressions.Regex.Replace(status.ToString(), "(?<!^)([A-Z])", " $1");

    [HttpGet]
    public async Task<ActionResult<IEnumerable<SampleDto>>> Get([FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? priority, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        try
        {
            var query = _context.Samples.Include(s => s.CreatedBy).Where(s => !s.IsDeleted).AsQueryable();
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(s => s.SampleNumber.Contains(search) || s.Location.Contains(search) || s.Origin.Contains(search));
            }
            if (!string.IsNullOrWhiteSpace(status) && TryParseSampleStatus(status, out var parsedStatus))
            {
                query = query.Where(s => s.Status == parsedStatus);
            }
            if (!string.IsNullOrWhiteSpace(priority))
            {
                query = query.Where(s => s.Priority == priority);
            }

            var total = await query.CountAsync();
            var items = await query.OrderByDescending(s => s.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).Select(s => new SampleDto(s)).ToListAsync();
            Response.Headers.Append("X-Total-Count", total.ToString());
            return Ok(new { items, total, page, pageSize });
        }
        catch (Exception ex)
        {
            // A failed query is a real error, not "no samples exist" — returning it as
            // an honest 500 instead of a fake-empty 200 means a database outage shows up
            // as an error in the UI rather than silently looking like an empty system.
            _logger.LogError(ex, "Samples query failed");
            return StatusCode(500, new { message = "Unable to load samples at the moment." });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<SampleDto>> GetById(string id)
    {
        try
        {
            Sample? sample;
            if (Guid.TryParse(id, out var guid))
            {
                sample = await _context.Samples.Include(s => s.Results).Include(s => s.CreatedBy).FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted);
            }
            else
            {
                sample = await _context.Samples.Include(s => s.Results).Include(s => s.CreatedBy).FirstOrDefaultAsync(s => s.SampleNumber == id && !s.IsDeleted);
            }
            return sample is null ? NotFound() : Ok(new SampleDto(sample));
        }
        catch (Exception ex)
        {
            // Same reasoning as Get(): a real failure shouldn't look identical to "this
            // sample doesn't exist".
            _logger.LogError(ex, "Sample lookup failed for id {SampleId}", id);
            return StatusCode(500, new { message = "Unable to look up this sample at the moment." });
        }
    }

    [HttpPost]
    [Authorize(Policy = "CanCreateRecords")]
    public async Task<ActionResult<SampleDto>> Create([FromBody] CreateSampleRequest request)
    {
        try
        {
            var sample = new Sample
            {
                Id = Guid.NewGuid(),
                SampleNumber = request.SampleNumber,
                Origin = request.Origin,
                SampleSource = request.SampleSource,
                Location = request.Location,
                Quantity = request.Quantity,
                Unit = request.Unit,
                Tonnage = request.Tonnage,
                Priority = request.Priority,
                Status = SampleStatus.PendingVerification,
                SubmittedBy = request.SubmittedBy,
                ReceivedBy = request.ReceivedBy,
                BatchNumber = request.BatchNumber,
                Notes = request.Notes,
                DateReceived = DateTimeOffset.UtcNow,
                CreatedById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString())
            };

            _context.Samples.Add(sample);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Create", "Sample", nameof(Sample), sample.Id.ToString(), "Sample registered", sample.CreatedById, User.Identity?.Name, sample.Id);
            var dto = new SampleDto(sample) { CreatedBy = User.FindFirst("staffId")?.Value ?? string.Empty };
            return CreatedAtAction(nameof(GetById), new { id = sample.Id }, dto);
        }
        // The frontend generates SampleNumber client-side from a 6-digit random suffix,
        // so a collision — while unlikely per attempt — is a real possibility as the
        // number of samples in a given year grows. Distinguished from other failures so
        // the user gets an actionable message instead of a generic "something went wrong".
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex, "Sample create failed due to a duplicate SampleNumber");
            return Conflict(new { message = "This Sample ID is already in use. Please try registering again." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sample create failed");
            return StatusCode(500, new { message = "Unable to create sample at the moment." });
        }
    }

    // Edits the sample's own descriptive fields (location, quantity, priority, assignment,
    // batch number, notes) as distinct from its workflow state, which only ever moves
    // through UpdateStatus below and its allowed-transition checks. Previously there was
    // no endpoint for these fields at all — the frontend's Edit Sample modal let a user
    // change all of them, but only ever called the status-update endpoint, so everything
    // except status silently never reached the database.
    [HttpPut("{id}")]
    public async Task<ActionResult<SampleDto>> Update(string id, [FromBody] UpdateSampleRequest request)
    {
        try
        {
            var sample = await ResolveSampleAsync(id);
            if (sample is null) return NotFound();

            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var canEditAny = role is "admin" or "bauxite_engineer" or "qa_engineer";
            var canEditOwn = role == "xrf_chemist" && sample.CreatedById == userId;
            if (!canEditAny && !canEditOwn)
            {
                return StatusCode(403, new { message = "You do not have permission to update this sample." });
            }

            sample.Location = request.Location;
            sample.Quantity = request.Quantity;
            sample.Priority = request.Priority;
            sample.AssignedTo = request.AssignedTo;
            sample.BatchNumber = request.BatchNumber;
            sample.Notes = request.Notes;
            sample.UpdatedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Update", "Sample", nameof(Sample), sample.Id.ToString(), "Sample details updated", userId, User.Identity?.Name, sample.Id);
            return Ok(new SampleDto(sample));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sample update failed for id {SampleId}", id);
            return StatusCode(500, new { message = "Unable to update sample at the moment." });
        }
    }

    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateSampleStatusRequest request)
    {
        try
        {
            var sample = await ResolveSampleAsync(id);
            if (sample is null) return NotFound();

            // xrf_chemist can only edit samples they created ("own"); admin,
            // bauxite_engineer and qa_engineer can edit any sample; management is
            // read-only and falls through to the 403 below.
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var canEditAny = role is "admin" or "bauxite_engineer" or "qa_engineer";
            var canEditOwn = role == "xrf_chemist" && sample.CreatedById == userId;
            if (!canEditAny && !canEditOwn)
            {
                return StatusCode(403, new { message = "You do not have permission to update this sample." });
            }

            if (!TryParseSampleStatus(request.Status, out var nextStatus)) return BadRequest();

            var allowedTransitions = new Dictionary<SampleStatus, List<SampleStatus>>
            {
                [SampleStatus.PendingRegistration] = new() { SampleStatus.PendingVerification },
                [SampleStatus.PendingVerification] = new() { SampleStatus.PendingAnalysis, SampleStatus.Rejected, SampleStatus.NeedsCorrection },
                [SampleStatus.NeedsCorrection] = new() { SampleStatus.PendingVerification },
                [SampleStatus.PendingAnalysis] = new() { SampleStatus.InProgress, SampleStatus.Rejected },
                [SampleStatus.InProgress] = new() { SampleStatus.Completed, SampleStatus.Rejected },
                [SampleStatus.Completed] = new() { SampleStatus.Approved, SampleStatus.Rejected },
                [SampleStatus.Approved] = new() { SampleStatus.Approved },
                [SampleStatus.Rejected] = new() { SampleStatus.Rejected }
            };

            if (!allowedTransitions[sample.Status].Contains(nextStatus)) return BadRequest(new { message = "Invalid status transition" });

            sample.Status = nextStatus;
            sample.UpdatedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
            var statusMessage = $"Sample status changed to {FormatSampleStatus(nextStatus)}";
            if (!string.IsNullOrWhiteSpace(request.Comment)) statusMessage += $": {request.Comment}";
            await _auditLogService.LogAsync("Update", "Sample", nameof(Sample), sample.Id.ToString(), statusMessage, userId, User.Identity?.Name, sample.Id);
            return Ok(new SampleDto(sample));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sample status update failed for id {SampleId}", id);
            return StatusCode(500, new { message = "Unable to update sample status at the moment." });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        try
        {
            var sample = await ResolveSampleAsync(id);
            if (sample is null) return NotFound();

            // Mirrors PERMISSIONS.delete in src/constants/lims.js: xrf_chemist may only
            // delete their own samples; bauxite_engineer and admin may delete any;
            // qa_engineer and management cannot delete at all.
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var canDeleteAny = role is "admin" or "bauxite_engineer";
            var canDeleteOwn = role == "xrf_chemist" && sample.CreatedById == userId;
            if (!canDeleteAny && !canDeleteOwn)
            {
                return StatusCode(403, new { message = "You do not have permission to delete this sample." });
            }

            // Soft delete: the row, and its historical results/COAs/audit trail, stay in
            // place. Every other lookup in this controller (and result/COA creation)
            // already filters IsDeleted, so a deleted sample behaves as gone everywhere
            // it should, without destroying the lab's record of it.
            sample.IsDeleted = true;
            sample.DeletedAt = DateTimeOffset.UtcNow;
            sample.DeletedById = userId;
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Delete", "Sample", nameof(Sample), sample.Id.ToString(), $"Sample {sample.SampleNumber} deleted", userId, User.Identity?.Name, sample.Id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sample delete failed for id {SampleId}", id);
            return StatusCode(500, new { message = "Unable to delete sample at the moment." });
        }
    }

    public record CreateSampleRequest(string SampleNumber, string Origin, string SampleSource, string Location, decimal Quantity, string Unit, decimal Tonnage, string Priority, string SubmittedBy, string ReceivedBy, string BatchNumber, string Notes);
    public record UpdateSampleRequest(string Location, decimal Quantity, string Priority, string? AssignedTo, string BatchNumber, string Notes);
    public record UpdateSampleStatusRequest(string Status, string? Comment = null);

    public class SampleDto
    {
        public SampleDto() { }
        public SampleDto(Sample sample)
        {
            Id = sample.Id;
            SampleNumber = sample.SampleNumber;
            Origin = sample.Origin;
            SampleSource = sample.SampleSource;
            Location = sample.Location;
            Quantity = sample.Quantity;
            Unit = sample.Unit;
            Tonnage = sample.Tonnage;
            Priority = sample.Priority;
            Status = FormatSampleStatus(sample.Status);
            SubmittedBy = sample.SubmittedBy;
            ReceivedBy = sample.ReceivedBy;
            BatchNumber = sample.BatchNumber;
            Notes = sample.Notes;
            AssignedTo = sample.AssignedTo ?? string.Empty;
            DateReceived = sample.DateReceived;
            CreatedAt = sample.CreatedAt;
            CreatedBy = sample.CreatedBy?.StaffId ?? string.Empty;
            Results = sample.Results.Select(r => new ResultDto(r)).ToList();
        }

        public Guid Id { get; set; }
        public string SampleNumber { get; set; } = string.Empty;
        public string Origin { get; set; } = string.Empty;
        public string SampleSource { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public string Unit { get; set; } = string.Empty;
        public decimal Tonnage { get; set; }
        public string Priority { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string SubmittedBy { get; set; } = string.Empty;
        public string ReceivedBy { get; set; } = string.Empty;
        public string BatchNumber { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public string AssignedTo { get; set; } = string.Empty;
        public DateTimeOffset DateReceived { get; set; }
        public DateTimeOffset CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public List<ResultDto> Results { get; set; } = new();
    }

    public class ResultDto
    {
        public ResultDto() { }
        public ResultDto(Result result)
        {
            Id = result.Id;
            AnalysisNumber = result.AnalysisNumber;
            Status = result.Status.ToString();
            Al2O3 = result.Al2O3;
            SiO2 = result.SiO2;
            Fe2O3 = result.Fe2O3;
            TiO2 = result.TiO2;
            Loi = result.Loi;
            TotalOxides = result.TotalOxides;
            Asr = result.Asr;
            Rr = result.Rr;
            Notes = result.Notes;
            AnalysisDate = result.AnalysisDate;
        }

        public Guid Id { get; set; }
        public string AnalysisNumber { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public decimal Al2O3 { get; set; }
        public decimal SiO2 { get; set; }
        public decimal Fe2O3 { get; set; }
        public decimal TiO2 { get; set; }
        public decimal Loi { get; set; }
        public decimal TotalOxides { get; set; }
        public decimal Asr { get; set; }
        public decimal Rr { get; set; }
        public string Notes { get; set; } = string.Empty;
        public DateTimeOffset AnalysisDate { get; set; }
    }
}
