namespace GbcLims.Domain.Entities;

public class AuditLog
{
    public Guid Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string Details { get; set; } = string.Empty;
    // Why the change was made, distinct from Details (what changed). Required for
    // corrective edits (Sample.Update, User.Update) — optional elsewhere (e.g. a
    // first-time Create has nothing to explain).
    public string? Reason { get; set; }
    // JSON snapshots of the entity's relevant fields immediately before/after this
    // change, so the audit trail shows what actually changed, not just that something
    // did. Null for Create (no "before") and Delete (no "after").
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public Guid? SampleId { get; set; }
    public Sample? Sample { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
