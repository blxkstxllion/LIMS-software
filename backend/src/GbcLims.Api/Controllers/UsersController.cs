using GbcLims.Api.Services;
using GbcLims.Domain.Constants;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = Roles.Admin)]
public class UsersController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly GbcLimsDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(UserManager<ApplicationUser> userManager, GbcLimsDbContext context, AuditLogService auditLogService, ILogger<UsersController> logger)
    {
        _userManager = userManager;
        _context = context;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    // UserManager.CreateAsync/UpdateAsync/DeleteAsync each call SaveChanges
    // internally, separately from the audit row AuditLogService.Log() stages for the
    // same DbContext instance — wrapping both in one explicit transaction is what
    // makes the two actually atomic, rather than two independent writes where a crash
    // between them leaves a change with no audit record. The InMemory provider (local
    // dev without Postgres) has no real transactions, so this is a no-op there.
    private async Task<IDbContextTransaction?> BeginAuditedTransactionAsync()
        => _context.Database.IsRelational() ? await _context.Database.BeginTransactionAsync() : null;

    // Suspending or password-resetting a user must end every one of their sessions
    // immediately, not up to 7 days later when each refresh token would otherwise
    // expire on its own — Login/Refresh both already check IsActive, but a
    // currently-logged-in client never calls either again on its own until its access
    // token expires or it tries to refresh, so revoking here is what actually closes
    // that window right away.
    private async Task RevokeAllRefreshTokensAsync(Guid userId)
    {
        var activeTokens = await _context.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync();
        foreach (var token in activeTokens) token.RevokedAt = DateTimeOffset.UtcNow;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> Get()
    {
        try
        {
            var users = await _userManager.Users.OrderBy(u => u.StaffId).ToListAsync();
            return Ok(users.Select(u => new UserDto(u)));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User list query failed");
            return StatusCode(500, new { message = "Unable to load users at the moment." });
        }
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest request)
    {
        try
        {
            if (await _userManager.Users.AnyAsync(u => u.StaffId == request.StaffId))
            {
                return BadRequest(new { message = "A user with this Staff ID already exists." });
            }

            var user = new ApplicationUser
            {
                UserName = request.StaffId,
                Email = request.Email,
                FullName = request.FullName,
                StaffId = request.StaffId,
                Department = request.Department,
                Role = request.Role,
                IsActive = true
            };

            await using var transaction = await BeginAuditedTransactionAsync();
            var createResult = await _userManager.CreateAsync(user, request.Password);
            if (!createResult.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
            }

            await _userManager.AddToRoleAsync(user, request.Role);
            _auditLogService.Log("Create", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} created", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name, newValues: new { user.StaffId, user.FullName, user.Email, user.Role, user.Department });
            await _context.SaveChangesAsync();
            if (transaction is not null) await transaction.CommitAsync();
            return CreatedAtAction(nameof(Get), new UserDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User create failed");
            return StatusCode(500, new { message = "Unable to create user at the moment." });
        }
    }

    [HttpPut("{staffId}")]
    public async Task<ActionResult<UserDto>> Update(string staffId, [FromBody] UpdateUserRequest request)
    {
        try
        {
            var user = await _userManager.Users.SingleOrDefaultAsync(u => u.StaffId == staffId);
            if (user is null) return NotFound();

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                return BadRequest(new { message = "A reason is required to update a user's details." });
            }

            var oldValues = new { user.FullName, user.Email, user.Role, user.Department };

            await using var transaction = await BeginAuditedTransactionAsync();
            if (user.Role != request.Role)
            {
                await _userManager.RemoveFromRoleAsync(user, user.Role);
                await _userManager.AddToRoleAsync(user, request.Role);
            }

            user.FullName = request.FullName;
            user.Email = request.Email;
            user.Department = request.Department;
            user.Role = request.Role;
            user.UpdatedAt = DateTimeOffset.UtcNow;
            await _userManager.UpdateAsync(user);

            var newValues = new { user.FullName, user.Email, user.Role, user.Department };
            _auditLogService.Log("Update", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} updated", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name, reason: request.Reason, oldValues: oldValues, newValues: newValues);
            await _context.SaveChangesAsync();
            if (transaction is not null) await transaction.CommitAsync();
            return Ok(new UserDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User update failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to update user at the moment." });
        }
    }

    [HttpPatch("{staffId}/status")]
    public async Task<ActionResult<UserDto>> UpdateStatus(string staffId, [FromBody] UpdateUserStatusRequest request)
    {
        try
        {
            var user = await _userManager.Users.SingleOrDefaultAsync(u => u.StaffId == staffId);
            if (user is null) return NotFound();

            var isActive = request.Status == "Active";
            var wasActive = user.IsActive;
            user.IsActive = isActive;
            user.UpdatedAt = DateTimeOffset.UtcNow;

            await using var transaction = await BeginAuditedTransactionAsync();
            if (!isActive)
            {
                await RevokeAllRefreshTokensAsync(user.Id);
            }
            await _userManager.UpdateAsync(user);
            _auditLogService.Log("Update", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} {(isActive ? "activated" : "suspended")}", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name, oldValues: new { IsActive = wasActive }, newValues: new { IsActive = isActive });
            await _context.SaveChangesAsync();
            if (transaction is not null) await transaction.CommitAsync();
            return Ok(new UserDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User status update failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to update user status at the moment." });
        }
    }

    // Uses Identity's reset-token flow (generate + immediately redeem) rather than
    // ChangePasswordAsync, which requires knowing the current password — the whole
    // point here is letting an admin recover an account whose password nobody
    // remembers. Also revokes the refresh token: a password reset should force
    // re-authentication, not leave whatever session was already open still valid.
    [HttpPatch("{staffId}/password")]
    public async Task<IActionResult> ResetPassword(string staffId, [FromBody] ResetPasswordRequest request)
    {
        try
        {
            var user = await _userManager.Users.SingleOrDefaultAsync(u => u.StaffId == staffId);
            if (user is null) return NotFound();

            await using var transaction = await BeginAuditedTransactionAsync();
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var result = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);
            if (!result.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", result.Errors.Select(e => e.Description)) });
            }

            await RevokeAllRefreshTokensAsync(user.Id);
            user.UpdatedAt = DateTimeOffset.UtcNow;
            await _userManager.UpdateAsync(user);

            var currentUserId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            _auditLogService.Log("Update", "User", nameof(ApplicationUser), user.Id.ToString(), $"Password reset for user {user.StaffId}", currentUserId, User.Identity?.Name);
            await _context.SaveChangesAsync();
            if (transaction is not null) await transaction.CommitAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Password reset failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to reset password at the moment." });
        }
    }

    [HttpDelete("{staffId}")]
    public async Task<IActionResult> Delete(string staffId)
    {
        try
        {
            var user = await _userManager.Users.SingleOrDefaultAsync(u => u.StaffId == staffId);
            if (user is null) return NotFound();

            var currentUserId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
            if (user.Id == currentUserId)
            {
                return BadRequest(new { message = "You cannot delete your own account." });
            }

            // Sample/Result/QcSample.CreatedBy is a Restrict foreign key specifically so
            // deleting a user can never silently orphan the lab's chain-of-custody records —
            // checked explicitly here (rather than letting the DB throw) so the admin gets a
            // clear reason instead of a 500. Suspend is the correct action for these users.
            var hasRecords = await _context.Samples.AnyAsync(s => s.CreatedById == user.Id)
                || await _context.Results.AnyAsync(r => r.CreatedById == user.Id)
                || await _context.QcSamples.AnyAsync(q => q.CreatedById == user.Id);
            if (hasRecords)
            {
                return BadRequest(new { message = "This user has samples, results, or QC records on file and can't be deleted — suspend them instead to preserve the audit trail." });
            }

            await using var transaction = await BeginAuditedTransactionAsync();
            var deleteResult = await _userManager.DeleteAsync(user);
            if (!deleteResult.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", deleteResult.Errors.Select(e => e.Description)) });
            }

            _auditLogService.Log("Delete", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} deleted", currentUserId, User.Identity?.Name);
            await _context.SaveChangesAsync();
            if (transaction is not null) await transaction.CommitAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User delete failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to delete user at the moment." });
        }
    }

    public record CreateUserRequest(string StaffId, string FullName, string Email, string Password, string Role, string Department);
    public record UpdateUserRequest(string FullName, string Email, string Role, string Department, string Reason);
    public record UpdateUserStatusRequest(string Status);
    public record ResetPasswordRequest(string NewPassword);

    public class UserDto
    {
        public UserDto() { }
        public UserDto(ApplicationUser user)
        {
            StaffId = user.StaffId;
            FullName = user.FullName;
            Email = user.Email ?? string.Empty;
            Role = user.Role;
            Department = user.Department;
            Status = user.IsActive ? "Active" : "Suspended";
            LastLogin = user.LastLoginAt;
        }

        public string StaffId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTimeOffset? LastLogin { get; set; }
    }
}
