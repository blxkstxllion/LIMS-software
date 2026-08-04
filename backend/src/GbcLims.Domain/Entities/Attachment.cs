namespace GbcLims.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; }
    public Guid SampleId { get; set; }
    public Sample Sample { get; set; } = null!;
    public string FileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeInBytes { get; set; }
    public string Group { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = string.Empty;
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
