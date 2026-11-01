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
public class CoasController : ControllerBase
{
    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<CoasController> _logger;

    public CoasController(GbcLimsDbContext context, AuditLogService auditLogService, UserManager<ApplicationUser> userManager, ILogger<CoasController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _userManager = userManager;
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

    // The frontend refers to a result by its human-readable AnalysisNumber, not the
    // internal Guid primary key. Accept either.
    private async Task<Result?> ResolveResultAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Results.FirstOrDefaultAsync(r => r.Id == guid);
            if (byId is not null) return byId;
        }

        return await _context.Results.FirstOrDefaultAsync(r => r.AnalysisNumber == identifier);
    }

    // The frontend refers to a COA by its human-readable CoaNumber, not the internal
    // Guid primary key. Accept either.
    private async Task<Coa?> ResolveCoaAsync(string identifier)
    {
        if (Guid.TryParse(identifier, out var guid))
        {
            var byId = await _context.Coas.Include(c => c.Sample).Include(c => c.ApprovedBy).Include(c => c.IssuedBy).FirstOrDefaultAsync(c => c.Id == guid);
            if (byId is not null) return byId;
        }

        return await _context.Coas.Include(c => c.Sample).Include(c => c.ApprovedBy).Include(c => c.IssuedBy).FirstOrDefaultAsync(c => c.CoaNumber == identifier);
    }

    // Draft -> Approved -> Issued only. The old Draft -> Issued shortcut let a COA skip
    // review entirely; removed so every certificate that leaves the lab has gone
    // through the Approved step first.
    private static readonly Dictionary<string, string[]> CoaStatusTransitions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Draft"] = new[] { "Approved" },
        ["Approved"] = new[] { "Issued" },
        ["Issued"] = Array.Empty<string>()
    };

    // CoaNumber is allocated here, from a real Postgres sequence, instead of the old
    // client-side `COA-${Date.now().slice(-6)}` scheme, which repeated every ~16.7
    // minutes. The InMemory provider (local dev without Postgres configured) has no
    // sequences, so it falls back to a millisecond-based value — fine for a single-user
    // dev box, not relied on for real uniqueness guarantees there.
    private async Task<string> GenerateCoaNumberAsync()
    {
        long value = _context.Database.IsRelational()
            ? await _context.Database.SqlQueryRaw<long>("SELECT nextval('coa_number_seq')").FirstAsync()
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % 1_000_000;
        return $"COA-{value:D6}";
    }

    // Builds a CoaDto purely from the snapshot fields frozen onto the Coa at creation
    // time (see Create below) — never re-queries Results. This is the fix for the bug
    // where an issued certificate's displayed values could change if the sample was
    // re-assayed after the COA was generated.
    private static CoaDto BuildCoaDto(Coa coa)
    {
        var dto = new CoaDto(coa);
        if (coa.Sample is not null)
        {
            dto.Sample = new CoaSampleSummaryDto { Origin = coa.Sample.Origin, DateReceived = coa.Sample.DateReceived };
        }
        dto.Result = new CoaResultSummaryDto
        {
            AnalystName = coa.SnapshotAnalystName,
            Method = coa.SnapshotMethod,
            AnalysisDate = coa.SnapshotAnalysisDate,
            Al2O3 = coa.SnapshotAl2O3,
            SiO2 = coa.SnapshotSiO2,
            Fe2O3 = coa.SnapshotFe2O3,
            TiO2 = coa.SnapshotTiO2,
            Loi = coa.SnapshotLoi,
            TotalOxides = coa.SnapshotTotalOxides,
            Asr = coa.SnapshotAsr,
            Rr = coa.SnapshotRr
        };
        return dto;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? sampleId, [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        try
        {
            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 1, 200);

            var query = _context.Coas.Include(c => c.Sample).Include(c => c.ApprovedBy).Include(c => c.IssuedBy).AsQueryable();
            if (!string.IsNullOrWhiteSpace(sampleId))
            {
                var sample = await ResolveSampleAsync(sampleId);
                if (sample is null) return Ok(new { items = Array.Empty<CoaDto>(), total = 0, page, pageSize });
                query = query.Where(c => c.SampleId == sample.Id);
            }

            var total = await query.CountAsync();
            var coas = await query.OrderByDescending(c => c.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
            var items = coas.Select(BuildCoaDto).ToList();
            return Ok(new { items, total, page, pageSize });
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
            if (sample is null) return NotFound(new { message = "Sample not found." });

            var result = await ResolveResultAsync(request.ResultId);
            if (result is null) return BadRequest(new { message = "Result not found." });
            if (result.SampleId != sample.Id) return BadRequest(new { message = "The selected result does not belong to this sample." });
            if (result.Status != ResultStatus.Approved) return BadRequest(new { message = "A COA can only be generated from an approved result." });

            var generatedById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());

            var coa = new Coa
            {
                Id = Guid.NewGuid(),
                CoaNumber = await GenerateCoaNumberAsync(),
                SampleId = sample.Id,
                Sample = sample,
                ResultId = result.Id,
                Result = result,
                SnapshotAnalystName = result.AnalystName,
                SnapshotMethod = result.Method,
                SnapshotAnalysisDate = result.AnalysisDate,
                SnapshotAl2O3 = result.Al2O3,
                SnapshotSiO2 = result.SiO2,
                SnapshotFe2O3 = result.Fe2O3,
                SnapshotTiO2 = result.TiO2,
                SnapshotLoi = result.Loi,
                SnapshotTotalOxides = result.TotalOxides,
                SnapshotAsr = result.Asr,
                SnapshotRr = result.Rr,
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
                GeneratedById = generatedById,
                GeneratedDate = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            _context.Coas.Add(coa);
            _auditLogService.Log("Create", "CoA", nameof(Coa), coa.Id.ToString(), $"COA generated from result {result.AnalysisNumber}", generatedById, User.Identity?.Name, sample.Id, newValues: new { coa.CoaNumber, coa.ResultId, coa.ClientName });
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(Get), new { sampleId = sample.Id }, BuildCoaDto(coa));
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

            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            var previousStatus = coa.Status;

            // E-signature: both Approve and Issue re-check the current password at the
            // moment of the decision — a certificate leaving the building is exactly
            // the kind of act that needs to be attributable to a deliberate signing,
            // not just "whoever had an open session."
            var currentUser = await _userManager.FindByIdAsync(userId.ToString());
            if (currentUser is null || string.IsNullOrWhiteSpace(request.Password) || !await _userManager.CheckPasswordAsync(currentUser, request.Password))
            {
                return StatusCode(401, new { message = "Incorrect password. Re-enter your password to confirm this decision." });
            }

            if (string.Equals(nextStatus, "Approved", StringComparison.OrdinalIgnoreCase))
            {
                // No exemption for admin here, unlike Result review (ResultsController) —
                // the person who generated this COA can never also be the one who
                // approves it. The certificate leaves the building after this step.
                if (coa.GeneratedById == userId)
                {
                    return StatusCode(403, new { message = "The COA's generator cannot also approve it." });
                }
                coa.ApprovedById = userId;
                coa.ApprovedAt = DateTimeOffset.UtcNow;
            }
            else if (string.Equals(nextStatus, "Issued", StringComparison.OrdinalIgnoreCase))
            {
                coa.IssuedById = userId;
                coa.IssuedAt = DateTimeOffset.UtcNow;
            }

            coa.Status = nextStatus;
            coa.UpdatedAt = DateTimeOffset.UtcNow;
            _auditLogService.Log("Update", "CoA", nameof(Coa), coa.Id.ToString(), $"COA status changed to {nextStatus}", userId, User.Identity?.Name, coa.SampleId, oldValues: new { Status = previousStatus }, newValues: new { Status = nextStatus });
            await _context.SaveChangesAsync();

            // Re-resolve so the newly-set ApprovedBy/IssuedBy navigation properties are
            // loaded for the response DTO (the in-memory `coa` instance only has the Ids).
            var refreshed = await ResolveCoaAsync(coa.Id.ToString());
            return Ok(BuildCoaDto(refreshed!));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "COA status update failed for id {CoaId}", id);
            return StatusCode(500, new { message = "Unable to update COA status at the moment." });
        }
    }

    public record CreateCoaRequest(string SampleId, string ResultId, string ClientName, string? ClientAddress, string? ClientContact, bool IncludeResults, bool IncludeMethodology, bool IncludeQcData, string? Remarks, DateTimeOffset IssueDate);
    public record UpdateCoaStatusRequest(string Status, string? Password = null);

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
            ApprovedBy = coa.ApprovedBy?.StaffId;
            ApprovedAt = coa.ApprovedAt;
            IssuedBy = coa.IssuedBy?.StaffId;
            IssuedAt = coa.IssuedAt;
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
        public string? ApprovedBy { get; set; }
        public DateTimeOffset? ApprovedAt { get; set; }
        public string? IssuedBy { get; set; }
        public DateTimeOffset? IssuedAt { get; set; }
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
