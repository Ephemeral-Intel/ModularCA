using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;

namespace ModularCA.API.Controllers.v1.Account
{
    /// <summary>
    /// Lightweight whoami endpoint. Returns the authenticated
    /// user's id, username, email, group memberships (with role levels and CA scope), MFA
    /// enrollment status, and tenant id. The frontends use this to populate an AuthContext
    /// instead of decoding the JWT body client-side. The endpoint is read-only and does
    /// not require any new schema.
    /// </summary>
    [ApiController]
    [Route("api/v1/me")]
    [Authorize]
    public class MeController(
        ICurrentUserService currentUser,
        ModularCADbContext db) : ControllerBase
    {
        private readonly ICurrentUserService _currentUser = currentUser;
        private readonly ModularCADbContext _db = db;

        /// <summary>
        /// Returns identity, group memberships, MFA enrollment, and primary tenant for
        /// the caller. Used by SPAs to drive client-side role gating and avoid
        /// localStorage-based identity decoding.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetMe()
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();

            var user = _currentUser.User;

            var groups = await _db.CaGroupMembers
                .Where(gm => gm.UserId == user.Id)
                .Include(gm => gm.Group)
                .ThenInclude(g => g!.CertificateAuthority)
                .Select(gm => new
                {
                    id = gm.Group!.Id,
                    name = gm.Group.Name,
                    displayName = gm.Group.DisplayName,
                    templateName = gm.Group.TemplateName ?? "Custom",
                    isSystemGroup = gm.Group.IsSystemGroup,
                    certificateAuthorityId = gm.Group.CertificateAuthorityId,
                    caLabel = gm.Group.CertificateAuthority != null ? gm.Group.CertificateAuthority.Label : null,
                    tenantId = gm.Group.TenantId,
                })
                .ToListAsync();

            // Effective scopes — flat list of strings the SPA can use for ProtectedRoute
            // checks. Format: "system:Admin", "system:Operator", "ca:<caId>:Admin", etc.
            var scopes = groups
                .Select(g => g.isSystemGroup
                    ? $"system:{g.templateName}"
                    : $"ca:{g.certificateAuthorityId}:{g.templateName}")
                .Distinct()
                .ToList();

            var hasTotp = await _db.TotpSecrets
                .AnyAsync(t => t.UserId == user.Id && t.IsVerified);
            var hasWebAuthn = await _db.Fido2Credentials
                .AnyAsync(c => c.UserId == user.Id);
            var hasMtls = await _db.MtlsCredentials
                .AnyAsync(c => c.UserId == user.Id && !c.IsRevoked && c.ExpiresAt > DateTime.UtcNow);

            var mfaConfigured = hasTotp || hasWebAuthn || hasMtls;

            // Pick a primary tenant from the user's group memberships. System groups have
            // a TenantId pointing at the System tenant — prefer a non-system tenant if any
            // is present, otherwise fall back to the system tenant.
            var primaryTenantId = groups
                .Where(g => !g.isSystemGroup)
                .Select(g => (Guid?)g.tenantId)
                .FirstOrDefault()
                ?? groups.Select(g => (Guid?)g.tenantId).FirstOrDefault();

            return Ok(new
            {
                id = user.Id,
                username = user.Username,
                email = user.Email,
                displayName = user.DisplayName,
                firstName = user.FirstName,
                lastName = user.LastName,
                isActive = user.IsActive,
                groups,
                scopes,
                mfa = new
                {
                    configured = mfaConfigured,
                    totp = hasTotp,
                    webauthn = hasWebAuthn,
                    mtls = hasMtls,
                },
                tenantId = primaryTenantId,
            });
        }

        /// <summary>
        /// Returns the calling user's effective permissions aggregated from all sources:
        /// direct capability grants, direct role assignments, group memberships with their
        /// capability grants, and group role assignments.
        /// </summary>
        [HttpGet("effective-permissions")]
        public async Task<IActionResult> GetEffectivePermissions()
        {
            await _currentUser.EnsureLoadedAsync();
            if (!_currentUser.IsAuthenticated || _currentUser.User == null)
                return Unauthorized();

            var userId = _currentUser.User.Id;

            // 1. Direct user grants
            var directGrants = await _db.UserCapabilityGrants
                .AsNoTracking()
                .Where(g => g.UserId == userId)
                .Select(g => new
                {
                    g.Capability,
                    g.TenantId,
                    g.CertificateAuthorityId,
                    g.ResourceType,
                    g.ResourceId
                })
                .ToListAsync();

            // 2. Direct role assignments on the user
            var userRoleAssignments = await _db.RoleAssignments
                .AsNoTracking()
                .Include(ra => ra.Role)
                    .ThenInclude(r => r.Capabilities)
                .Where(ra => ra.UserId == userId && ra.GroupId == null)
                .ToListAsync();

            var roleAssignments = userRoleAssignments.Select(ra => new
            {
                RoleName = ra.Role.Name,
                Scope = new
                {
                    ra.TenantId,
                    ra.CertificateAuthorityId
                },
                Capabilities = ra.Role.Capabilities.Select(c => c.Capability).ToList()
            }).ToList();

            // 3. Group memberships -> group direct grants + group role assignments
            var groupMembershipIds = await _db.CaGroupMembers
                .AsNoTracking()
                .Where(m => m.UserId == userId)
                .Select(m => m.GroupId)
                .ToListAsync();

            var groups = await _db.CaGroups
                .AsNoTracking()
                .Where(g => groupMembershipIds.Contains(g.Id))
                .ToListAsync();

            var groupDirectGrants = await _db.CapabilityGrants
                .AsNoTracking()
                .Where(cg => groupMembershipIds.Contains(cg.GroupId))
                .ToListAsync();

            var groupRoleAssignments = await _db.RoleAssignments
                .AsNoTracking()
                .Include(ra => ra.Role)
                    .ThenInclude(r => r.Capabilities)
                .Where(ra => ra.GroupId != null && groupMembershipIds.Contains(ra.GroupId.Value))
                .ToListAsync();

            var groupMemberships = groups.Select(g => new
            {
                GroupName = g.DisplayName ?? g.Name,
                GroupId = g.Id,
                DirectCapabilities = groupDirectGrants
                    .Where(cg => cg.GroupId == g.Id)
                    .Select(cg => cg.Capability)
                    .ToList(),
                RoleAssignments = groupRoleAssignments
                    .Where(ra => ra.GroupId == g.Id)
                    .Select(ra => new
                    {
                        RoleName = ra.Role.Name,
                        Capabilities = ra.Role.Capabilities.Select(c => c.Capability).ToList()
                    })
                    .ToList()
            }).ToList();

            return Ok(new
            {
                UserId = userId,
                DirectGrants = directGrants,
                RoleAssignments = roleAssignments,
                GroupMemberships = groupMemberships
            });
        }
    }
}
