using Microsoft.AspNetCore.Identity;

namespace GbcLims.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public string StaffId { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Role { get; set; } = "chemist";
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastLoginAt { get; set; }
    // Lockout tracking is inherited from IdentityUser<Guid> (LockoutEnd, LockoutEnabled,
    // AccessFailedCount) — this class must not redeclare LockoutEnd. Doing so previously
    // shadowed the base property instead of overriding it, so Identity's real lockout
    // logic set a value nothing ever read back, and account lockout silently never
    // engaged despite CheckPasswordSignInAsync reporting IsLockedOut correctly.
    public string? RefreshToken { get; set; }
    public DateTimeOffset? RefreshTokenExpiryTime { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Sample> Samples { get; set; } = new List<Sample>();
    public ICollection<Result> Results { get; set; } = new List<Result>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
}
