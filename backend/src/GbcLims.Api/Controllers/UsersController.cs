using GbcLims.Api.Services;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "admin")]
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

            var createResult = await _userManager.CreateAsync(user, request.Password);
            if (!createResult.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", createResult.Errors.Select(e => e.Description)) });
            }

            await _userManager.AddToRoleAsync(user, request.Role);
            await _auditLogService.LogAsync("Create", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} created", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name);
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
            await _auditLogService.LogAsync("Update", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} updated", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name);
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
            user.IsActive = isActive;
            user.UpdatedAt = DateTimeOffset.UtcNow;

            // Suspending a user must end their session immediately, not up to 7 days later
            // when their refresh token would otherwise expire on its own. Login and Refresh
            // both already check IsActive, but a currently-logged-in user's client never
            // calls either of those again on its own until the access token expires or the
            // refresh token is used — clearing the refresh token here closes that window.
            if (!isActive)
            {
                user.RefreshToken = null;
                user.RefreshTokenExpiryTime = null;
            }

            await _userManager.UpdateAsync(user);
            await _auditLogService.LogAsync("Update", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} {(isActive ? "activated" : "suspended")}", Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString()), User.Identity?.Name);
            return Ok(new UserDto(user));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User status update failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to update user status at the moment." });
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

            var deleteResult = await _userManager.DeleteAsync(user);
            if (!deleteResult.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", deleteResult.Errors.Select(e => e.Description)) });
            }

            await _auditLogService.LogAsync("Delete", "User", nameof(ApplicationUser), user.Id.ToString(), $"User {user.StaffId} deleted", currentUserId, User.Identity?.Name);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "User delete failed for staffId {StaffId}", staffId);
            return StatusCode(500, new { message = "Unable to delete user at the moment." });
        }
    }

    public record CreateUserRequest(string StaffId, string FullName, string Email, string Password, string Role, string Department);
    public record UpdateUserRequest(string FullName, string Email, string Role, string Department);
    public record UpdateUserStatusRequest(string Status);

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
