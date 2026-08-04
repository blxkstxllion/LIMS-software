using GbcLims.Domain.Enums;

namespace GbcLims.Domain.Entities;

public class Sample
{
    public Guid Id { get; set; }
    public string SampleNumber { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string SampleSource { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = string.Empty;
    public decimal Tonnage { get; set; }
    public string Priority { get; set; } = "Medium";
    public SampleStatus Status { get; set; }
    public string SubmittedBy { get; set; } = string.Empty;
    public string ReceivedBy { get; set; } = string.Empty;
    public string BatchNumber { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string? VerificationComment { get; set; }
    public DateTimeOffset DateReceived { get; set; }
    public string? AssignedTo { get; set; }
    public Guid CreatedById { get; set; }
    public ApplicationUser CreatedBy { get; set; } = null!;
    public Guid? VerifiedById { get; set; }
    public ApplicationUser? VerifiedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsDeleted { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedById { get; set; }
    public ApplicationUser? DeletedBy { get; set; }

    public ICollection<Result> Results { get; set; } = new List<Result>();
    public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
}
