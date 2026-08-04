using System.Security.Claims;
using GbcLims.Api.Services;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class QcSamplesController : ControllerBase
{
    // 2% mirrors the tolerance the frontend has always used to color a QC result
    // pass/fail; kept as a constant here since Pass/Fail is now decided server-side,
    // not trusted from the client.
    private const decimal ToleranceThreshold = 2m;

    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly ILogger<QcSamplesController> _logger;

    public QcSamplesController(GbcLimsDbContext context, AuditLogService auditLogService, ILogger<QcSamplesController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<QcSampleDto>>> Get()
    {
        try
        {
            var qcSamples = await _context.QcSamples
                .Include(q => q.ReferenceSample)
                .Include(q => q.CreatedBy)
                .OrderByDescending(q => q.CreatedAt)
                .ToListAsync();
            return Ok(qcSamples.Select(q => new QcSampleDto(q)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "QC sample query failed");
            return StatusCode(500, new { message = "Unable to load QC samples at the moment." });
        }
    }

    // Same roles the frontend already gates the "+ Add QC Sample" button on
    // (src/pages/FeaturePages.jsx: everyone except management) — not the narrower
    // CanCreateRecords policy, which omits qa_engineer.
    [HttpPost]
    [Authorize(Roles = "admin,xrf_chemist,bauxite_engineer,qa_engineer")]
    public async Task<ActionResult<QcSampleDto>> Create([FromBody] CreateQcSampleRequest request)
    {
        try
        {
            Guid? referenceSampleId = null;
            if (!string.IsNullOrWhiteSpace(request.ReferenceSampleId))
            {
                var sample = Guid.TryParse(request.ReferenceSampleId, out var guid)
                    ? await _context.Samples.FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted)
                    : await _context.Samples.FirstOrDefaultAsync(s => s.SampleNumber == request.ReferenceSampleId && !s.IsDeleted);
                if (sample is null) return BadRequest(new { message = "Reference sample not found." });
                referenceSampleId = sample.Id;
            }

            if (await _context.QcSamples.AnyAsync(q => q.QcNumber == request.QcNumber))
            {
                return BadRequest(new { message = "A QC sample with this ID already exists." });
            }

            var variance = request.ExpectedAl2O3 == 0 ? 0 : Math.Abs((request.ActualAl2O3 - request.ExpectedAl2O3) / request.ExpectedAl2O3 * 100);
            var status = variance <= ToleranceThreshold ? "Pass" : "Fail";
            var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());

            var qcSample = new QcSample
            {
                Id = Guid.NewGuid(),
                QcNumber = request.QcNumber,
                Type = request.Type,
                ReferenceSampleId = referenceSampleId,
                ExpectedAl2O3 = request.ExpectedAl2O3,
                ActualAl2O3 = request.ActualAl2O3,
                Variance = Math.Round(variance, 2),
                Status = status,
                CreatedById = userId,
                CreatedAt = DateTimeOffset.UtcNow
            };

            _context.QcSamples.Add(qcSample);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Create", "QcSample", nameof(QcSample), qcSample.Id.ToString(), $"QC sample {qcSample.QcNumber} recorded, result: {status}", userId, User.Identity?.Name, referenceSampleId);

            await _context.Entry(qcSample).Reference(q => q.CreatedBy).LoadAsync();
            return CreatedAtAction(nameof(Get), new QcSampleDto(qcSample));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "QC sample create failed");
            return StatusCode(500, new { message = "Unable to add QC sample at the moment." });
        }
    }

    public record CreateQcSampleRequest(string QcNumber, string Type, string? ReferenceSampleId, decimal ExpectedAl2O3, decimal ActualAl2O3);

    public class QcSampleDto
    {
        public QcSampleDto() { }
        public QcSampleDto(QcSample qcSample)
        {
            Id = qcSample.Id;
            QcNumber = qcSample.QcNumber;
            Type = qcSample.Type;
            ReferenceSampleId = qcSample.ReferenceSample?.SampleNumber ?? string.Empty;
            ExpectedAl2O3 = qcSample.ExpectedAl2O3;
            ActualAl2O3 = qcSample.ActualAl2O3;
            Variance = qcSample.Variance;
            Status = qcSample.Status;
            CreatedAt = qcSample.CreatedAt;
            CreatedBy = qcSample.CreatedBy?.FullName ?? string.Empty;
        }

        public Guid Id { get; set; }
        public string QcNumber { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string ReferenceSampleId { get; set; } = string.Empty;
        public decimal ExpectedAl2O3 { get; set; }
        public decimal ActualAl2O3 { get; set; }
        public decimal Variance { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }
}
