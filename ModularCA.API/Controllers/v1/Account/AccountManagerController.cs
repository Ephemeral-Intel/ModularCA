using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using ModularCA.API.Controllers.v1.Auth;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Management;

namespace ModularCA.API.Controllers.v1.Account
{
    /// <summary>
    /// User account self-service endpoints for profile updates and password changes.
    /// </summary>
    [ApiController]
    [Route("api/v1/account")]
    [Authorize]
    public class AccountManagerController(
        IUserManagementService userManager,
        ICurrentUserService currentUser,
        IAuditService auditService,
        IDistributedCache cache,
        ModularCADbContext db) : ControllerBase
    {
        private readonly IUserManagementService _userManager = userManager;
        private readonly ICurrentUserService _currentUser = currentUser;
        private readonly IAuditService _audit = auditService;
        private readonly IDistributedCache _cache = cache;
        private readonly ModularCADbContext _db = db;

        [HttpGet]
        public async Task<IActionResult> GetUserInfo()
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();
            var user = await _userManager.GetUserById(_currentUser.User.Id);
            if (user == null)
                return NotFound();
            return Ok(user);
        }

        /// <summary>
        /// Changes the authenticated user's password. Requires a valid step-up MFA token
        /// via the X-MFA-Token header to prevent unauthorized password changes from hijacked sessions.
        /// Audit findings #32: emits <see cref="AuditActionType.UserPasswordChanged"/> with
        /// <c>success=false</c> when the underlying call returns false or throws — restoring the
        /// credential-stuffing signal that previously only fired on successful changes.
        /// </summary>
        [HttpPut("password")]
        public async Task<IActionResult> ChangePassword([FromBody] UpdatePasswordRequest request,
            [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();

            // Require step-up MFA verification
            if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.ChangePassword))
                return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

            bool result;
            try
            {
                result = await _userManager.UpdateUserPassword(_currentUser.User.Id, request);
            }
            catch (Exception ex)
            {
                // Audit findings #32: capture exception-path failures so brute-force / credential
                // stuffing attempts produce a SIEM-visible signal even when the underlying service
                // throws (e.g. user lookup failure, DB write timeout). Wrapped so audit-store
                // failure cannot shadow the original error rethrow.
                try
                {
                    await _audit.LogAsync(AuditActionType.UserPasswordChanged, _currentUser.User.Id, _currentUser.User.Username,
                        "User", _currentUser.User.Id.ToString(),
                        sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
                        success: false,
                        errorMessage: ex.Message);
                }
                catch
                {
                    // Swallow — surface the original exception.
                }
                throw;
            }

            if (result)
            {
                await _audit.LogAsync(AuditActionType.UserPasswordChanged, _currentUser.User.Id, _currentUser.User.Username,
                    "User", _currentUser.User.Id.ToString(),
                    sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString());
                return Ok(new { message = "Password changed successfully" });
            }

            // Audit findings #32: also emit failure record on the false-returning path so SIEM
            // sees both wrong-current-password and policy-rejection failures.
            try
            {
                await _audit.LogAsync(AuditActionType.UserPasswordChanged, _currentUser.User.Id, _currentUser.User.Username,
                    "User", _currentUser.User.Id.ToString(),
                    sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
                    success: false,
                    errorMessage: "Password change rejected (wrong current password or policy violation).");
            }
            catch
            {
                // Swallow — keep the original 400 to the user.
            }
            return BadRequest(new { error = "Failed to change password" });
        }

        /// <summary>
        /// Returns the authenticated user's MFA enrollment status, including
        /// which methods are configured and their details.
        /// </summary>
        [HttpGet("mfa")]
        public async Task<IActionResult> GetMfaStatus()
        {
            await _currentUser.EnsureLoadedAsync();
            if (_currentUser.User == null) return Unauthorized();
            var userId = _currentUser.User.Id;

            var totp = await _db.TotpSecrets
                .Where(t => t.UserId == userId && t.IsVerified)
                .Select(t => new { t.DeviceName, t.RegisteredAt, t.LastUsedAt })
                .FirstOrDefaultAsync();

            var webauthnCreds = await _db.Fido2Credentials
                .Where(c => c.UserId == userId)
                .Select(c => new { c.Id, c.DeviceName, c.RegisteredAt, c.LastUsedAt })
                .OrderByDescending(c => c.RegisteredAt)
                .ToListAsync();

            var mtlsCreds = await _db.MtlsCredentials
                .Where(c => c.UserId == userId && !c.IsRevoked)
                .Select(c => new { c.Id, c.DeviceName, c.SerialNumber, c.IssuedAt, c.ExpiresAt, c.SigningCaId })
                .OrderByDescending(c => c.IssuedAt)
                .ToListAsync();

            return Ok(new
            {
                totp = new { enrolled = totp != null, deviceName = totp?.DeviceName, registeredAt = (DateTime?)totp?.RegisteredAt, lastUsedAt = totp?.LastUsedAt },
                webauthn = new { enrolled = webauthnCreds.Count > 0, credentials = webauthnCreds },
                mtls = new { enrolled = mtlsCreds.Count > 0, credentials = mtlsCreds },
                hasStepUpCapability = totp != null || webauthnCreds.Count > 0
            });
        }

    }
}
