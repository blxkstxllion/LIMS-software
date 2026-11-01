namespace GbcLims.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; }
    // Nullable: File Management holds plenty of files with no single sample they belong
    // to (calibration records, QC standard references, general lab photos), not just
    // per-sample scans.
    public Guid? SampleId { get; set; }
    public Sample? Sample { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeInBytes { get; set; }
    public string Group { get; set; } = string.Empty;
    // UploadedBy stays a display-name string for the UI; UploadedById is what delete
    // authorization actually checks (AttachmentsController.Delete) — two staff sharing
    // a display name must never be able to delete each other's files.
    public string UploadedBy { get; set; } = string.Empty;
    public Guid? UploadedById { get; set; }
    public ApplicationUser? UploadedByUser { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
