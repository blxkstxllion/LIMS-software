namespace GbcLims.Domain.Entities;

public class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    // SHA-256 hash of the raw token, never the raw value — a stolen database dump
    // can't be replayed as a valid refresh token, even though hashing still lets a
    // lookup happen in O(1) by hashing whatever the client presents the same way.
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    // Set on rotation (a successful /refresh) or explicit logout/suspend — kept rather
    // than deleted, so one row per device/session can coexist (logging in elsewhere
    // no longer kills every other session) and a revoked row can still answer "was
    // this ever valid" rather than looking identical to a token that never existed.
    public DateTimeOffset? RevokedAt { get; set; }
}
