using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using GbcLims.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IConfiguration _configuration;

    public AuthController(UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, IConfiguration configuration)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _configuration = configuration;
    }

    [HttpPost("login")]
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

        var token = await GenerateJwtToken(user);
        var refreshToken = GenerateRefreshToken();
        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiryTime = DateTimeOffset.UtcNow.AddDays(7);
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
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
    {
        var user = await _userManager.Users.SingleOrDefaultAsync(u => u.RefreshToken == request.RefreshToken);
        if (user is null || user.RefreshTokenExpiryTime is null || user.RefreshTokenExpiryTime <= DateTimeOffset.UtcNow)
        {
            return Unauthorized(new { message = "Invalid refresh token" });
        }

        var token = await GenerateJwtToken(user);
        var refreshToken = GenerateRefreshToken();
        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiryTime = DateTimeOffset.UtcNow.AddDays(7);
        await _userManager.UpdateAsync(user);

        return Ok(new AuthResponse { AccessToken = token, RefreshToken = refreshToken, ExpiresIn = 3600, User = new UserDto { Id = user.Id, StaffId = user.StaffId, FullName = user.FullName, Email = user.Email!, Role = user.Role } });
    }

    // Revokes the refresh token server-side so it can no longer be exchanged for a new
    // access token. The still-unexpired access token used to call this endpoint remains
    // valid for the rest of its (short, 1-hour) lifetime — that's an inherent limit of
    // stateless JWTs without a full revocation-list; the refresh token is the part that
    // actually matters, since it's what would otherwise let a stolen token keep working
    // for up to 7 days after the user thought they'd logged out.
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = Guid.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is not null)
        {
            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;
            await _userManager.UpdateAsync(user);
        }

        return NoContent();
    }

    private async Task<string> GenerateJwtToken(ApplicationUser user)
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

    private static string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }

    public record LoginRequest(string StaffId, string Password);
    public record RefreshTokenRequest(string RefreshToken);

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
