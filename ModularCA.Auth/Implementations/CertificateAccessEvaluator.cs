using Microsoft.EntityFrameworkCore;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Enums;

namespace ModularCA.Auth.Implementations
{
    /// <summary>
    /// Evaluates certificate access by checking all four grant sources:
    /// group direct grants, group role assignments, user direct grants, and user role assignments.
    /// Falls back to explicit per-cert ACL entries.
    /// </summary>
    public class CertificateAccessEvaluator : ICertificateAccessEvaluator
    {
        private readonly ModularCADbContext _db;

        public CertificateAccessEvaluator(ModularCADbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// Checks if the user has the given capability for the given CA across all 4 grant sources.
        /// </summary>
        private bool HasCapabilityForCa(Guid userId, string capability, Guid? caId, Guid? tenantId)
        {
            // Source 1: group direct grants (system, tenant, CA-scoped)
            if (_db.CapabilityGrants.Any(g =>
                    g.Group.Members.Any(m => m.UserId == userId) &&
                    g.Capability == capability && g.ResourceType == null &&
                    (g.Group.IsSystemGroup
                     || g.Group.CertificateAuthorityId == caId
                     || (tenantId != null && g.Group.CertificateAuthorityId == null && !g.Group.IsSystemGroup && g.Group.TenantId == tenantId))))
                return true;

            // Source 2: role via group
            if (_db.RoleAssignments.Any(ra =>
                    ra.GroupId != null &&
                    ra.Group!.Members.Any(m => m.UserId == userId) &&
                    ra.Role.Capabilities.Any(rc => rc.Capability == capability && rc.ResourceType == null) &&
                    (ra.Group.IsSystemGroup
                     || ra.Group.CertificateAuthorityId == caId
                     || (tenantId != null && ra.Group.CertificateAuthorityId == null && !ra.Group.IsSystemGroup && ra.Group.TenantId == tenantId))))
                return true;

            // Source 3: direct user grants
            if (_db.UserCapabilityGrants.Any(ug =>
                    ug.UserId == userId && ug.Capability == capability && ug.ResourceType == null &&
                    ((ug.TenantId == null && ug.CertificateAuthorityId == null)
                     || (tenantId != null && ug.TenantId == tenantId && ug.CertificateAuthorityId == null)
                     || (caId != null && ug.CertificateAuthorityId == caId))))
                return true;

            // Source 4: role via user
            if (_db.RoleAssignments.Any(ra =>
                    ra.UserId == userId && ra.GroupId == null &&
                    ra.Role.Capabilities.Any(rc => rc.Capability == capability && rc.ResourceType == null) &&
                    ((ra.TenantId == null && ra.CertificateAuthorityId == null)
                     || (tenantId != null && ra.TenantId == tenantId && ra.CertificateAuthorityId == null)
                     || (caId != null && ra.CertificateAuthorityId == caId))))
                return true;

            return false;
        }

        /// <summary>
        /// Determines whether the user can view the specified certificate.
        /// </summary>
        public bool CanViewCertificate(Guid userId, Guid certificateId)
        {
            var cert = _db.Certificates
                .Include(c => c.CertificateAuthority)
                .FirstOrDefault(c => c.CertificateId == certificateId);
            if (cert == null) return false;

            var caId = cert.CertificateAuthority?.Id;
            var tenantId = cert.CertificateAuthority?.TenantId;

            if (HasCapabilityForCa(userId, Capabilities.CertView, caId, tenantId))
                return true;

            // Original requestor can always view their own cert
            if (_db.CertificateRequests.Any(r =>
                r.IssuedCertificateId == certificateId && r.RequestorUserId == userId))
                return true;

            // Explicit ACL
            return _db.CertificateAccessLists.Any(a =>
                a.UserId == userId && a.CertificateId == certificateId &&
                a.AccessLevel >= CertificateAccessLevel.View);
        }

        /// <summary>
        /// Determines whether the user can manage (revoke, reissue, etc.) the specified certificate.
        /// </summary>
        public bool CanManageCertificate(Guid userId, Guid certificateId)
        {
            var cert = _db.Certificates
                .Include(c => c.CertificateAuthority)
                .FirstOrDefault(c => c.CertificateId == certificateId);
            if (cert == null) return false;

            var caId = cert.CertificateAuthority?.Id;
            var tenantId = cert.CertificateAuthority?.TenantId;

            if (HasCapabilityForCa(userId, Capabilities.SystemManage, caId, tenantId))
                return true;
            if (HasCapabilityForCa(userId, Capabilities.CertRevoke, caId, tenantId))
                return true;

            // Explicit ACL
            return _db.CertificateAccessLists.Any(a =>
                a.UserId == userId && a.CertificateId == certificateId &&
                a.AccessLevel == CertificateAccessLevel.Manage);
        }
    }
}
