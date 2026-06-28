using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Auth.Services
{
    /// <summary>
    /// Manages certificate-level ACLs by copying permissions on reissue and granting
    /// initial manage access to the requestor on new issuance. Reissue is a no-op when
    /// no prior certificate with the same <c>SubjectDN</c> exists (brand-new subject) —
    /// the caller's grant path runs separately so the new cert still ends up with the
    /// requestor's manage permission.
    /// </summary>
    public class CertificateAccessService(
        ModularCADbContext dbContext,
        TimeProvider? timeProvider = null) : ICertificateAccessService
    {
        private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;

        /// <summary>
        /// Copies all access permissions from the previous certificate (identified by matching
        /// <c>SubjectDN</c>) to the reissued certificate. Excludes the new certificate itself
        /// from the predecessor lookup — without that filter a brand-new subject (no prior
        /// cert) silently picks the new cert as its own predecessor and the copy becomes a
        /// new→new no-op. When no real predecessor exists we return cleanly so brand-new
        /// subjects don't throw on a benign "no permissions to inherit" path.
        /// </summary>
        public async Task UpdatePermissionsOntoReissuedCertificate(Guid newCertId, Guid userContext)
        {
            var newCert = await dbContext.Certificates.FindAsync(newCertId);
            if (newCert == null)
                throw new InvalidOperationException("New certificate not found");

            var oldCert = await dbContext.Certificates
                .Where(c => c.SubjectDN == newCert.SubjectDN && c.CertificateId != newCertId)
                .OrderByDescending(c => c.NotBefore)
                .FirstOrDefaultAsync();

            if (oldCert == null)
                return; // No predecessor — nothing to inherit. Caller's grant path runs separately.

            // Copy permissions from old certificate to new certificate.
            var permissions = await dbContext.CertificateAccessLists
                .Where(c => c.CertificateId == oldCert.CertificateId)
                .ToListAsync();

            // Users that already hold an ACL row on the new cert — e.g. the requestor's manage grant
            // added by the issuance path. The (UserId, CertificateId) unique index means re-inserting
            // any of these throws a duplicate-key DbUpdateException (the reissue 500), so skip them.
            var alreadyGranted = (await dbContext.CertificateAccessLists
                .Where(c => c.CertificateId == newCert.CertificateId)
                .Select(c => c.UserId)
                .ToListAsync()).ToHashSet();

            foreach (var permission in permissions)
            {
                // HashSet.Add returns false when the user is already present (pre-existing row, or a
                // duplicate within this copy) — skip to honor the unique constraint.
                if (!alreadyGranted.Add(permission.UserId))
                    continue;

                dbContext.CertificateAccessLists.Add(new CertificateAccessListEntity
                {
                    UserId = permission.UserId,
                    CertificateId = newCert.CertificateId,
                    AccessLevel = permission.AccessLevel,
                    GrantedAt = _timeProvider.GetUtcNow().UtcDateTime,
                    GrantedByUserId = userContext
                });
            }
            await dbContext.SaveChangesAsync();
        }

        /// <summary>
        /// Grants manage-level access to the user who originally requested the certificate.
        /// </summary>
        public async Task SetPermissionsOnNewCertificate(Guid certId, Guid userContext)
        {
            var cert = await dbContext.Certificates.FindAsync(certId);
            if (cert == null)
                throw new InvalidOperationException("Certificate not found");

            var csrEntry = await dbContext.CertificateRequests.Where(c => c.IssuedCertificateId == certId).FirstOrDefaultAsync();
            if (csrEntry == null)
                throw new InvalidOperationException("Certificate request not found");
            var userId = csrEntry.RequestorUserId;
            if (userId == null)
                throw new InvalidOperationException("User not found");

            var permission = new CertificateAccessListEntity
            {
                UserId = userId.Value,
                CertificateId = cert.CertificateId,
                AccessLevel = CertificateAccessLevel.Manage,
                GrantedAt = _timeProvider.GetUtcNow().UtcDateTime,
                GrantedByUserId = userContext
            };
            dbContext.CertificateAccessLists.Add(permission);
            await dbContext.SaveChangesAsync();
        }
    }
}
