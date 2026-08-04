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
public class CoasController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly ILogger<CoasController> _logger;

    public CoasController(GbcLimsDbContext context, AuditLogService auditLogService, ILogger<CoasController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    // The frontend refers to samples by their human-readable SampleNumber, not the
    // internal Guid primary key. Accept either. Excludes soft-deleted samples: you
    // can't generate a new COA against a sample that's been deleted, even though
    // existing COAs keep their historical link.
    private async Task<Sample?> ResolveSampleAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Samples.FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted);
            if (byId is not null) return byId;
        }

        return await _context.Samples.FirstOrDefaultAsync(s => s.SampleNumber == identifier && !s.IsDeleted);
    }

    // The frontend refers to a COA by its human-readable CoaNumber, not the internal
    // Guid primary key. Accept either.
    private async Task<Coa?> ResolveCoaAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Coas.Include(c => c.Sample).FirstOrDefaultAsync(c => c.Id == guid);
            if (byId is not null) return byId;
        }

        return await _context.Coas.Include(c => c.Sample).FirstOrDefaultAsync(c => c.CoaNumber == identifier);
    }

    private static readonly Dictionary<string, string[]> CoaStatusTransitions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Draft"] = new[] { "Approved", "Issued" },
        ["Approved"] = new[] { "Issued" },
        ["Issued"] = Array.Empty<string>()
    };

    // Builds a CoaDto with the sample and (best-guess) result snapshot embedded, so the
    // frontend can render a full COA document straight from this object alone — no need
    // to cross-reference the separately-loaded samples/results lists, which also means
    // it keeps working after a page reload or after the sample is later soft-deleted.
    // The domain model has no direct Coa->Result link, so this picks the most recent
    // approved result for the COA's sample, mirroring the same lookup the frontend used
    // to do client-side when a COA was first generated.
    private async Task<CoaDto> BuildCoaDtoAsync(Coa coa)
    {
        var dto = new CoaDto(coa);
        if (coa.Sample is not null)
        {
            dto.Sample = new CoaSampleSummaryDto { Origin = coa.Sample.Origin, DateReceived = coa.Sample.DateReceived };
        }

        var linkedResult = await _context.Results
            .Where(r => r.SampleId == coa.SampleId && r.Status == ResultStatus.Approved)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync();
        if (linkedResult is not null)
        {
            dto.Result = new CoaResultSummaryDto
            {
                AnalystName = linkedResult.AnalystName,
                Method = linkedResult.Method,
                AnalysisDate = linkedResult.AnalysisDate,
                Al2O3 = linkedResult.Al2O3,
                SiO2 = linkedResult.SiO2,
                Fe2O3 = linkedResult.Fe2O3,
                TiO2 = linkedResult.TiO2,
                Loi = linkedResult.Loi,
                TotalOxides = linkedResult.TotalOxides,
                Asr = linkedResult.Asr,
                Rr = linkedResult.Rr
            };
        }

        return dto;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? sampleId)
    {
        try
        {
            var query = _context.Coas.Include(c => c.Sample).AsQueryable();
            if (!string.IsNullOrWhiteSpace(sampleId))
            {
                var sample = await ResolveSampleAsync(sampleId);
                if (sample is null) return Ok(new { items = Array.Empty<CoaDto>() });
                query = query.Where(c => c.SampleId == sample.Id);
            }
            var coas = await query.OrderByDescending(c => c.CreatedAt).ToListAsync();
            var items = new List<CoaDto>();
            foreach (var coa in coas)
            {
                items.Add(await BuildCoaDtoAsync(coa));
            }
            return Ok(new { items });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "COA query failed");
            return StatusCode(500, new { message = "Unable to load COAs at the moment." });
        }
    }

    [HttpPost]
    [Authorize(Policy = "CanGenerateCoas")]
    public async Task<IActionResult> Create([FromBody] CreateCoaRequest request)
    {
        try
        {
            var sample = await ResolveSampleAsync(request.SampleId);
            if (sample is null) return NotFound();

            var coa = new Coa
            {
                Id = Guid.NewGuid(),
                CoaNumber = request.CoaNumber,
                SampleId = sample.Id,
                Sample = sample,
                ClientName = request.ClientName,
                ClientAddress = request.ClientAddress,
                ClientContact = request.ClientContact,
                IncludeResults = request.IncludeResults,
                IncludeMethodology = request.IncludeMethodology,
                IncludeQcData = request.IncludeQcData,
                Remarks = request.Remarks,
                IssueDate = request.IssueDate,
                Status = "Draft",
                GeneratedBy = User.FindFirst(ClaimTypes.Name)?.Value ?? "system",
                GeneratedDate = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            _context.Coas.Add(coa);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Create", "CoA", nameof(Coa), coa.Id.ToString(), "COA generated", Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name, sample.Id);
            var dto = await BuildCoaDtoAsync(coa);
            return CreatedAtAction(nameof(Get), new { sampleId = sample.Id }, dto);
        }
        // CoaNumber is generated client-side from the trailing digits of Date.now(),
        // which repeats every ~16.7 minutes — a real, if infrequent, collision risk.
        // Called out separately so the user gets an actionable message.
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex, "COA create failed due to a duplicate CoaNumber");
            return Conflict(new { message = "This COA number is already in use. Please try generating again." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "COA create failed");
            return StatusCode(500, new { message = "Unable to generate COA at the moment." });
        }
    }

    [HttpPatch("{id}/status")]
    [Authorize(Policy = "CanGenerateCoas")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateCoaStatusRequest request)
    {
        try
        {
            var coa = await ResolveCoaAsync(id);
            if (coa is null) return NotFound();

            var canonicalStatuses = new[] { "Draft", "Approved", "Issued" };
            var nextStatus = canonicalStatuses.FirstOrDefault(s => string.Equals(s, request.Status, StringComparison.OrdinalIgnoreCase));
            if (nextStatus is null) return BadRequest(new { message = "Unknown status" });

            if (!CoaStatusTransitions.TryGetValue(coa.Status, out var allowed) || !allowed.Contains(nextStatus, StringComparer.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Invalid status transition" });
            }

            coa.Status = nextStatus;
            coa.UpdatedAt = DateTimeOffset.UtcNow;
            await _context.SaveChangesAsync();
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            await _auditLogService.LogAsync("Update", "CoA", nameof(Coa), coa.Id.ToString(), $"COA status changed to {nextStatus}", userId, User.Identity?.Name, coa.SampleId);
            var dto = await BuildCoaDtoAsync(coa);
            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "COA status update failed for id {CoaId}", id);
            return StatusCode(500, new { message = "Unable to update COA status at the moment." });
        }
    }

    public record CreateCoaRequest(string CoaNumber, string SampleId, string ClientName, string? ClientAddress, string? ClientContact, bool IncludeResults, bool IncludeMethodology, bool IncludeQcData, string? Remarks, DateTimeOffset IssueDate);
    public record UpdateCoaStatusRequest(string Status);

    public class CoaDto
    {
        public CoaDto() { }
        public CoaDto(Coa coa)
        {
            Id = coa.Id;
            CoaNumber = coa.CoaNumber;
            SampleId = coa.Sample?.SampleNumber ?? coa.SampleId.ToString();
            ClientName = coa.ClientName;
            ClientAddress = coa.ClientAddress;
            ClientContact = coa.ClientContact;
            IncludeResults = coa.IncludeResults;
            IncludeMethodology = coa.IncludeMethodology;
            IncludeQcData = coa.IncludeQcData;
            Remarks = coa.Remarks;
            IssueDate = coa.IssueDate;
            Status = coa.Status;
            GeneratedBy = coa.GeneratedBy;
            GeneratedDate = coa.GeneratedDate;
        }

        public Guid Id { get; set; }
        public string CoaNumber { get; set; } = string.Empty;
        public string SampleId { get; set; } = string.Empty;
        public string ClientName { get; set; } = string.Empty;
        public string? ClientAddress { get; set; }
        public string? ClientContact { get; set; }
        public bool IncludeResults { get; set; }
        public bool IncludeMethodology { get; set; }
        public bool IncludeQcData { get; set; }
        public string? Remarks { get; set; }
        public DateTimeOffset IssueDate { get; set; }
        public string Status { get; set; } = string.Empty;
        public string GeneratedBy { get; set; } = string.Empty;
        public DateTimeOffset GeneratedDate { get; set; }
        public CoaSampleSummaryDto? Sample { get; set; }
        public CoaResultSummaryDto? Result { get; set; }
    }

    public class CoaSampleSummaryDto
    {
        public string Origin { get; set; } = string.Empty;
        public DateTimeOffset DateReceived { get; set; }
    }

    public class CoaResultSummaryDto
    {
        public string AnalystName { get; set; } = string.Empty;
        public string Method { get; set; } = string.Empty;
        public DateTimeOffset AnalysisDate { get; set; }
        public decimal Al2O3 { get; set; }
        public decimal SiO2 { get; set; }
        public decimal Fe2O3 { get; set; }
        public decimal TiO2 { get; set; }
        public decimal Loi { get; set; }
        public decimal TotalOxides { get; set; }
        public decimal Asr { get; set; }
        public decimal Rr { get; set; }
    }
}
