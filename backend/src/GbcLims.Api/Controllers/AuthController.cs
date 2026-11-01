using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly GbcLimsDbContext _context;
    private readonly IConfiguration _configuration;

    public AuthController(UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, GbcLimsDbContext context, IConfiguration configuration)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _context = context;
        _configuration = configuration;
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.Users.SingleOrDefaultAsync(u => u.StaffId == request.StaffId);
        if (user is null) return Unauthorized(new { message = "Invalid credentials" });

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, true);
        if (!result.Succeeded)
        {
            if (result.IsLockedOut) return Unauthorized(new { message = "Account locked out" });
            return Unauthorized(new { message = "Invalid credentials" });
        }

        // Checked after the password check (not before) so a suspended account's
        // password failures still count toward lockout the same as any other account.
        if (!user.IsActive) return Unauthorized(new { message = "Account suspended" });

        var token = GenerateJwtToken(user);
        // A new row, not a replacement of some single stored token — logging in on a
        // second device no longer invalidates the first (each login/refresh gets its
        // own RefreshTokens row, so sessions coexist independently).
        var refreshToken = await IssueRefreshTokenAsync(user.Id);
        user.LastLoginAt = DateTimeOffset.UtcNow;
        await _userManager.UpdateAsync(user);

        return Ok(new AuthResponse
        {
            AccessToken = token,
            RefreshToken = refreshToken,
            ExpiresIn = 3600,
            User = new UserDto { Id = user.Id, StaffId = user.StaffId, FullName = user.FullName, Email = user.Email!, Role = user.Role }
        });
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
    {
        var tokenHash = HashToken(request.RefreshToken);
        var existing = await _context.RefreshTokens.Include(t => t.User).SingleOrDefaultAsync(t => t.TokenHash == tokenHash);
        if (existing is null || existing.RevokedAt is not null || existing.ExpiresAt <= DateTimeOffset.UtcNow || !existing.User.IsActive)
        {
            return Unauthorized(new { message = "Invalid refresh token" });
        }

        var user = existing.User;
        var token = GenerateJwtToken(user);
        // Rotation: this token is single-use. Revoking it here (rather than letting it
        // keep working until its own 7-day expiry) means a leaked-and-reused refresh
        // token is only ever usable once before the legitimate client's next refresh
        // makes the old value dead.
        existing.RevokedAt = DateTimeOffset.UtcNow;
        var refreshToken = await IssueRefreshTokenAsync(user.Id);

        return Ok(new AuthResponse { AccessToken = token, RefreshToken = refreshToken, ExpiresIn = 3600, User = new UserDto { Id = user.Id, StaffId = user.StaffId, FullName = user.FullName, Email = user.Email!, Role = user.Role } });
    }

    // Revokes just the refresh token this client presents, not every session — logging
    // out on one device shouldn't end another device's still-open session. The access
    // token used to call this endpoint remains valid for the rest of its (short,
    // 1-hour) lifetime regardless — an inherent limit of stateless JWTs without a full
    // revocation list; the refresh token is the part that actually matters, since it's
    // what would otherwise let a stolen token keep working for up to 7 days.
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            var tokenHash = HashToken(request.RefreshToken);
            var existing = await _context.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == tokenHash);
            if (existing is not null && existing.RevokedAt is null)
            {
                existing.RevokedAt = DateTimeOffset.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        return NoContent();
    }

    private async Task<string> IssueRefreshTokenAsync(Guid userId)
    {
        var raw = GenerateRawRefreshToken();
        _context.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = HashToken(raw),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            CreatedAt = DateTimeOffset.UtcNow
        });
        await _context.SaveChangesAsync();
        return raw;
    }

    private string GenerateJwtToken(ApplicationUser user)
    {
        // Program.cs fails fast at startup if Jwt:Secret is missing or still a
        // placeholder, so it's guaranteed valid here — no fallback to a known string.
        var secret = _configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        var issuer = _configuration["Jwt:Issuer"] ?? "https://localhost";
        var audience = _configuration["Jwt:Audience"] ?? "https://localhost";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName ?? user.Email ?? user.StaffId),
            new(ClaimTypes.Role, user.Role),
            new("staffId", user.StaffId),
            new("fullName", user.FullName)
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateRawRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }

    // SHA-256, not a slow password hash (bcrypt/argon2/PBKDF2) — refresh tokens are
    // already 64 bytes of CSPRNG output, not a human-memorable secret an attacker
    // could feasibly brute-force or dictionary-guess, so there's nothing a slow hash
    // defends against here that a fast one doesn't; a fast hash is what lets a lookup
    // by presented token stay a single indexed equality check.
    private static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }

    public record LoginRequest(string StaffId, string Password);
    public record RefreshTokenRequest(string RefreshToken);
    public record LogoutRequest(string? RefreshToken);

    public class AuthResponse
    {
        public string AccessToken { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public int ExpiresIn { get; set; }
        public UserDto User { get; set; } = null!;
    }

    public class UserDto
    {
        public Guid Id { get; set; }
        public string StaffId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
    }
}
