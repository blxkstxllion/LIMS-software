using System.Security.Claims;
using GbcLims.Api.Services;
using GbcLims.Domain.Constants;
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
    // Lab documents and images only — no executables, scripts, or archives. Checked by
    // extension (case-insensitive); the on-disk filename is always a fresh GUID
    // regardless (see the comment on Upload below), so this is purely about what kind
    // of content the lab accepts, not path safety.
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".csv", ".xlsx", ".doc", ".docx", ".jpg", ".jpeg", ".png"
    };

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
    public async Task<ActionResult<IEnumerable<AttachmentDto>>> Get([FromQuery] string? sampleId, [FromQuery] int limit = 200)
    {
        try
        {
            limit = Math.Clamp(limit, 1, 200);
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

            // Capped, not truly paged: unlike Samples/Results/Coas, nothing in the UI
            // currently needs a page beyond the first, and keeping the response a bare
            // array (not {items, total, ...}) avoids a frontend contract change for a
            // table with zero rows in production today. Revisit if File Management
            // grows enough that 200 stops being "effectively everything."
            var attachments = await query.OrderByDescending(a => a.UploadedAt).Take(limit).ToListAsync();
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

            // Management is a read-only role everywhere else in the app (PERMISSIONS in
            // src/constants/lims.js) — uploading a file is a write, so it shouldn't be
            // reachable just because this endpoint was otherwise unrestricted by role.
            var role = User.FindFirst(ClaimTypes.Role)?.Value;
            if (role == Roles.Management)
            {
                return StatusCode(403, new { message = "Management access is read-only and cannot upload files." });
            }

            var requestExtension = Path.GetExtension(request.File.FileName);
            if (string.IsNullOrWhiteSpace(requestExtension) || !AllowedExtensions.Contains(requestExtension))
            {
                return BadRequest(new { message = "Unsupported file type. Allowed: PDF, CSV, XLSX, DOCX, JPG, PNG." });
            }

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
            var storedFileName = $"{Guid.NewGuid()}{requestExtension}";
            var fullPath = Path.Combine(StorageRoot, storedFileName);

            await using (var stream = new FileStream(fullPath, FileMode.Create))
            {
                await request.File.CopyToAsync(stream);
            }

            var uploaderId = Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var parsedUploaderId) ? parsedUploaderId : (Guid?)null;
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
                UploadedById = uploaderId,
                UploadedAt = DateTimeOffset.UtcNow
            };

            _context.Attachments.Add(attachment);
            var uploadDetails = $"File {attachment.FileName} uploaded" + (sample is not null ? $" to Sample {sample.SampleNumber}" : "");
            _auditLogService.Log("Create", "Attachment", nameof(Attachment), attachment.Id.ToString(), uploadDetails, uploaderId, User.Identity?.Name, sampleId);
            await _context.SaveChangesAsync();
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
            var currentUserId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            // By user ID, not display name — two staff sharing a display name must
            // never be able to delete each other's files.
            if (role != Roles.Admin && attachment.UploadedById != currentUserId)
            {
                return StatusCode(403, new { message = "You do not have permission to delete this file." });
            }

            var fullPath = Path.Combine(StorageRoot, attachment.StoredFileName);
            if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);

            _context.Attachments.Remove(attachment);
            _auditLogService.Log("Delete", "Attachment", nameof(Attachment), attachment.Id.ToString(), $"File {attachment.FileName} deleted", currentUserId, User.Identity?.Name, attachment.SampleId);
            await _context.SaveChangesAsync();
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
