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

    public ResultsController(GbcLimsDbContext context, AuditLogService auditLogService)
    {
        _context = context;
        _auditLogService = auditLogService;
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

    [HttpPost]
    [Authorize(Policy = "CanCreateRecords")]
    public async Task<IActionResult> Create([FromBody] CreateResultRequest request)
    {
        var sample = await ResolveSampleAsync(request.SampleId);
        if (sample is null) return NotFound();

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
            Status = ResultStatus.Submitted,
            CreatedById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString())
        };

        _context.Results.Add(result);
        await _context.SaveChangesAsync();
        await _auditLogService.LogAsync("Create", "Result", nameof(Result), result.Id.ToString(), "Result entered", result.CreatedById, User.Identity?.Name, result.SampleId);
        var dto = new ResultDto(result) { CreatedBy = User.FindFirst("staffId")?.Value ?? string.Empty };
        return CreatedAtAction(nameof(Get), new { sampleId = result.SampleId }, dto);
    }

    [HttpPatch("{id}/status")]
    [Authorize(Policy = "CanApproveResults")]
    public async Task<IActionResult> UpdateStatus(string id, [FromBody] UpdateResultStatusRequest request)
    {
        var result = await ResolveResultAsync(id);
        if (result is null) return NotFound();

        // Segregation of duties: whoever submitted a result cannot also be the one
        // who approves or rejects it.
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        if (result.CreatedById == userId)
        {
            return StatusCode(403, new { message = "You cannot approve or reject a result you submitted yourself." });
        }

        if (!Enum.TryParse<ResultStatus>(request.Status, true, out var nextStatus)) return BadRequest();

        var allowedTransitions = new Dictionary<ResultStatus, List<ResultStatus>>
        {
            [ResultStatus.Draft] = new() { ResultStatus.Submitted },
            [ResultStatus.Submitted] = new() { ResultStatus.Approved, ResultStatus.Rejected },
            [ResultStatus.Approved] = new() { ResultStatus.Approved },
            [ResultStatus.Rejected] = new() { ResultStatus.Rejected }
        };

        if (!allowedTransitions[result.Status].Contains(nextStatus)) return BadRequest(new { message = "Invalid status transition" });

        result.Status = nextStatus;
        result.ApprovalComment = request.Comment;
        result.ApprovedById = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        result.UpdatedAt = DateTimeOffset.UtcNow;
        await _context.SaveChangesAsync();
        await _auditLogService.LogAsync("Update", "Result", nameof(Result), result.Id.ToString(), $"Result status changed to {nextStatus}", result.ApprovedById, User.Identity?.Name, result.SampleId);
        return Ok(new ResultDto(result));
    }

    public record CreateResultRequest(string SampleId, string AnalysisNumber, DateTimeOffset AnalysisDate, string AnalystName, string Method, string Equipment, decimal Moisture, decimal Al2O3, decimal SiO2, decimal Fe2O3, decimal TiO2, decimal Loi, decimal Cao, decimal Mgo, decimal Na2O, decimal K2O, decimal? P2O5, decimal? MnO, decimal? Cr2O3, decimal TotalOxides, decimal Asr, decimal Rr, bool Calibrated, decimal? StandardDeviation, string? Repeatability, string Notes);
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
