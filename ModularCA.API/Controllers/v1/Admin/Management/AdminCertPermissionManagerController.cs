using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ModularCA.Auth.Interfaces;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Management;

namespace ModularCA.API.Controllers.v1.Admin.Management
{
    /// <summary>
    /// Admin endpoints for managing certificate access permissions (view/manage grants per user).
    /// </summary>
    [ApiController]
    [Route("api/v1/admin/manage/cert-permissions")]
    [Authorize(Policy = "CaOperator")]
    public class AdminCertPermissionManagerController(ICertificateStore certStore, ICurrentUserService currentUser, ICertificateAccessAssignment accessAssignment, IAuditService audit) : ControllerBase
    {
        private readonly ICertificateStore _certStore = certStore;
        private readonly ICurrentUserService _currentUser = currentUser;
        private readonly ICertificateAccessAssignment _accessAssignment = accessAssignment;
        private readonly IAuditService _audit = audit;

        // Grant read or manage access
        [HttpPost("allow/view")]
        public async Task<IActionResult> GrantViewPermission([FromBody] PermissionChangeRequest request)
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();
            Guid certId = new Guid(request.CertId);
            /*
            var cert = await _certStore.GetCertificateByIdAsync(certId);
            
            if (cert == null)
                return NotFound();
            */

            var result = await _accessAssignment.AssignCertificateViewAccessAsync(_currentUser.User.Id, certId);
            if (result)
            {
                await _audit.LogAsync(AuditActionType.CertPermissionViewGranted, _currentUser.User?.Id, _currentUser.User?.Username,
                    "Certificate", certId.ToString(),
                    new { TargetUserId = request.UserId, CertificateId = request.CertId, PermissionLevel = "View" },
                    HttpContext.Connection.RemoteIpAddress?.ToString());
                return Ok(new { message = $"Granted view access to user {request.UserId} for cert {request.CertId}" });
            }
            return BadRequest();
        }

        [HttpPost("allow/manage")]
        public async Task<IActionResult> GrantManagePermission([FromBody] PermissionChangeRequest request)
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();
            Guid certId = new Guid(request.CertId);


            var result = await _accessAssignment.AssignCertificateManageAccessAsync(_currentUser.User.Id, certId);
            if (result)
            {
                await _audit.LogAsync(AuditActionType.CertPermissionManageGranted, _currentUser.User?.Id, _currentUser.User?.Username,
                    "Certificate", certId.ToString(),
                    new { TargetUserId = request.UserId, CertificateId = request.CertId, PermissionLevel = "Manage" },
                    HttpContext.Connection.RemoteIpAddress?.ToString());
                return Ok(new { message = $"Granted manage access to user {request.UserId} for cert {request.CertId}" });
            }
            return BadRequest();
        }

        // Downgrade manage to read
        [HttpPost("downgrade")]
        public async Task<IActionResult> DowngradePermission([FromBody] PermissionChangeRequest request)
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();
            Guid certId = new Guid(request.CertId);


            var result = await _accessAssignment.DowngradeCertificateManageAccessAsync(_currentUser.User.Id, certId);
            if (result)
            {
                await _audit.LogAsync(AuditActionType.CertPermissionDowngraded, _currentUser.User?.Id, _currentUser.User?.Username,
                    "Certificate", certId.ToString(),
                    new { TargetUserId = request.UserId, CertificateId = request.CertId, FromLevel = "Manage", ToLevel = "View" },
                    HttpContext.Connection.RemoteIpAddress?.ToString());
                return Ok(new { message = $"Downgraded access to view only for user {request.UserId} for cert {request.CertId}" });
            }
            return BadRequest();
        }

        // Revoke access
        [HttpPost("revoke")]
        public async Task<IActionResult> RevokePermission([FromBody] PermissionChangeRequest request)
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();
            Guid certId = new Guid(request.CertId);


            var result = await _accessAssignment.RevokeCertificateAccessAsync(_currentUser.User.Id, certId);
            if (result)
            {
                await _audit.LogAsync(AuditActionType.CertPermissionRevoked, _currentUser.User?.Id, _currentUser.User?.Username,
                    "Certificate", certId.ToString(),
                    new { TargetUserId = request.UserId, CertificateId = request.CertId },
                    HttpContext.Connection.RemoteIpAddress?.ToString());
                return Ok(new { message = $"Revoked access to view only for user {request.UserId} for cert {request.CertId}" });
            }
            return BadRequest();
        }
    }


}
