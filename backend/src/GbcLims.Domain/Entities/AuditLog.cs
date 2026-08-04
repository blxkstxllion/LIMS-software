namespace GbcLims.Domain.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string Details { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public Guid? SampleId { get; set; }
    public Sample? Sample { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
