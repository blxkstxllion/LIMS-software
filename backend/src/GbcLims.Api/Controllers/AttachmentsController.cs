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
public class AttachmentsController : ControllerBase
{
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AttachmentsController> _logger;

    public AttachmentsController(GbcLimsDbContext context, AuditLogService auditLogService, IWebHostEnvironment environment, IConfiguration configuration, ILogger<AttachmentsController> logger)
    {
        _context = context;
        _auditLogService = auditLogService;
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    // Configurable so a real deployment can point this at a mounted volume instead of
    // the API's own content root; defaults to a local folder for local/dev use.
    private string StorageRoot
    {
        get
        {
            var configured = _configuration["Storage:AttachmentsPath"];
            var root = string.IsNullOrWhiteSpace(configured) ? Path.Combine(_environment.ContentRootPath, "App_Data", "attachments") : configured;
            Directory.CreateDirectory(root);
            return root;
        }
    }

    private string CurrentUserDisplayName => User.FindFirst("fullName")?.Value ?? User.FindFirst("staffId")?.Value ?? User.Identity?.Name ?? "Unknown";

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AttachmentDto>>> Get([FromQuery] string? sampleId)
    {
        try
        {
            var query = _context.Attachments.Include(a => a.Sample).AsQueryable();
            if (!string.IsNullOrWhiteSpace(sampleId))
            {
                if (Guid.TryParse(sampleId, out var sampleGuid))
                {
                    query = query.Where(a => a.SampleId == sampleGuid);
                }
                else
                {
                    query = query.Where(a => a.Sample != null && a.Sample.SampleNumber == sampleId);
                }
            }

            var attachments = await query.OrderByDescending(a => a.UploadedAt).ToListAsync();
            return Ok(attachments.Select(a => new AttachmentDto(a)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Attachment list query failed");
            return StatusCode(500, new { message = "Unable to load files at the moment." });
        }
    }

    [HttpPost]
    [RequestSizeLimit(MaxFileSizeBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxFileSizeBytes)]
    public async Task<ActionResult<AttachmentDto>> Upload([FromForm] UploadAttachmentRequest request)
    {
        try
        {
            if (request.File is null || request.File.Length == 0) return BadRequest(new { message = "No file provided." });
            if (request.File.Length > MaxFileSizeBytes) return BadRequest(new { message = "File exceeds the 50MB limit." });

            Guid? sampleId = null;
            Sample? sample = null;
            if (!string.IsNullOrWhiteSpace(request.SampleId))
            {
                sample = Guid.TryParse(request.SampleId, out var guid)
                    ? await _context.Samples.FirstOrDefaultAsync(s => s.Id == guid && !s.IsDeleted)
                    : await _context.Samples.FirstOrDefaultAsync(s => s.SampleNumber == request.SampleId && !s.IsDeleted);
                if (sample is null) return BadRequest(new { message = "Sample not found." });
                sampleId = sample.Id;
            }

            // The original file name is never used to build a disk path — only to display
            // and to name the file back on download. The on-disk name is always a fresh
            // GUID, so a name like "../../evil.sh" or one colliding with another upload
            // can't do anything but sit there as harmless display text.
            var extension = Path.GetExtension(request.File.FileName);
            var storedFileName = $"{Guid.NewGuid()}{extension}";
            var fullPath = Path.Combine(StorageRoot, storedFileName);

            await using (var stream = new FileStream(fullPath, FileMode.Create))
            {
                await request.File.CopyToAsync(stream);
            }

            var attachment = new Attachment
            {
                Id = Guid.NewGuid(),
                SampleId = sampleId,
                Sample = sample,
                FileName = request.File.FileName,
                StoredFileName = storedFileName,
                ContentType = string.IsNullOrWhiteSpace(request.File.ContentType) ? "application/octet-stream" : request.File.ContentType,
                SizeInBytes = request.File.Length,
                Group = string.IsNullOrWhiteSpace(request.Group) ? "General" : request.Group,
                UploadedBy = CurrentUserDisplayName,
                UploadedAt = DateTimeOffset.UtcNow
            };

            _context.Attachments.Add(attachment);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Create", "Attachment", nameof(Attachment), attachment.Id.ToString(), $"File {attachment.FileName} uploaded", null, User.Identity?.Name, sampleId);
            return CreatedAtAction(nameof(Get), new AttachmentDto(attachment));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Attachment upload failed");
            return StatusCode(500, new { message = "Unable to upload file at the moment." });
        }
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        try
        {
            var attachment = await _context.Attachments.FindAsync(id);
            if (attachment is null) return NotFound();

            var fullPath = Path.Combine(StorageRoot, attachment.StoredFileName);
            if (!System.IO.File.Exists(fullPath)) return NotFound();

            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
            return File(stream, attachment.ContentType, attachment.FileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Attachment download failed for id {AttachmentId}", id);
            return StatusCode(500, new { message = "Unable to download file at the moment." });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var attachment = await _context.Attachments.FindAsync(id);
            if (attachment is null) return NotFound();

            var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            if (role != "admin" && attachment.UploadedBy != CurrentUserDisplayName)
            {
                return StatusCode(403, new { message = "You do not have permission to delete this file." });
            }

            var fullPath = Path.Combine(StorageRoot, attachment.StoredFileName);
            if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);

            _context.Attachments.Remove(attachment);
            await _context.SaveChangesAsync();
            await _auditLogService.LogAsync("Delete", "Attachment", nameof(Attachment), attachment.Id.ToString(), $"File {attachment.FileName} deleted", null, User.Identity?.Name, attachment.SampleId);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Attachment delete failed for id {AttachmentId}", id);
            return StatusCode(500, new { message = "Unable to delete file at the moment." });
        }
    }

    public class UploadAttachmentRequest
    {
        public IFormFile? File { get; set; }
        public string? Group { get; set; }
        public string? SampleId { get; set; }
    }

    public class AttachmentDto
    {
        public AttachmentDto() { }
        public AttachmentDto(Attachment attachment)
        {
            Id = attachment.Id;
            SampleId = attachment.Sample?.SampleNumber ?? string.Empty;
            FileName = attachment.FileName;
            ContentType = attachment.ContentType;
            SizeInBytes = attachment.SizeInBytes;
            Group = attachment.Group;
            UploadedBy = attachment.UploadedBy;
            UploadedAt = attachment.UploadedAt;
        }

        public Guid Id { get; set; }
        public string SampleId { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long SizeInBytes { get; set; }
        public string Group { get; set; } = string.Empty;
        public string UploadedBy { get; set; } = string.Empty;
        public DateTimeOffset UploadedAt { get; set; }
    }
}
