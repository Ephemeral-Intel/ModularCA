using Microsoft.EntityFrameworkCore;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;

namespace ModularCA.Auth.Implementations
{
    public class CertificateAccessAssignment : ICertificateAccessAssignment
    {
        private readonly ModularCADbContext _dbContext;
        public CertificateAccessAssignment(ModularCADbContext dbContext)
        {
            _dbContext = dbContext;

        }

        public async Task<bool> AssignCertificateViewAccessAsync(Guid userId, Guid certificateId)
        {
            var user = await _dbContext.Users.Where(u => u.Id == userId).FirstOrDefaultAsync();
            if (user == null)
                return false;

            var existingAccess = await _dbContext.CertificateAccessLists
                .Where(a => a.UserId == userId && a.CertificateId == certificateId)
                .FirstOrDefaultAsync();

            if (existingAccess != null)
            {
                if (existingAccess.AccessLevel != CertificateAccessLevel.View)
                {
                    existingAccess.AccessLevel = CertificateAccessLevel.View;
                    _dbContext.CertificateAccessLists.Update(existingAccess);
                    return await _dbContext.SaveChangesAsync() > 0;
                }
                // Already has View access, nothing to change
                return true;
            }

            var accessAssignment = new CertificateAccessListEntity
            {
                UserId = user.Id,
                CertificateId = certificateId,
                AccessLevel = CertificateAccessLevel.View
            };
            _dbContext.CertificateAccessLists.Add(accessAssignment);
            return await _dbContext.SaveChangesAsync() > 0;
        }

        public async Task<bool> AssignCertificateManageAccessAsync(Guid userId, Guid certificateId)
        {
            var user = await _dbContext.Users.Where(u => u.Id == userId).FirstOrDefaultAsync();
            if (user == null) return false;
            var existingAccess = await _dbContext.CertificateAccessLists
                .Where(a => a.UserId == userId && a.CertificateId == certificateId)
                .FirstOrDefaultAsync();
            if (existingAccess != null)
            {
                if (existingAccess.AccessLevel != CertificateAccessLevel.Manage)
                {
                    existingAccess.AccessLevel = CertificateAccessLevel.Manage;
                    _dbContext.CertificateAccessLists.Update(existingAccess);
                    return await _dbContext.SaveChangesAsync() > 0;
                }
                // Already has Manage access, nothing to change
                return true;
            }
            var accessAssignment = new CertificateAccessListEntity
            {
                UserId = user.Id,
                CertificateId = certificateId,
                AccessLevel = CertificateAccessLevel.Manage
            };
            _dbContext.CertificateAccessLists.Add(accessAssignment);
            return await _dbContext.SaveChangesAsync() > 0;
        }

        // This will puposefully nuke all permissions. Who needs manage access if they aren't allowed to view the cert?
        public async Task<bool> RevokeCertificateAccessAsync(Guid userId, Guid certificateId)
        {
            var accessAssignment = await _dbContext.CertificateAccessLists
                .Where(a => a.UserId == userId && a.CertificateId == certificateId)
                .FirstOrDefaultAsync();
            if (accessAssignment != null)
            {
                _dbContext.CertificateAccessLists.Remove(accessAssignment);
                return await _dbContext.SaveChangesAsync() > 0;
            }
            return false;
        }


        // this will only revoke manage access
        public async Task<bool> DowngradeCertificateManageAccessAsync(Guid userId, Guid certificateId)
        {
            var accessAssignment = await _dbContext.CertificateAccessLists
                .Where(a => a.UserId == userId && a.CertificateId == certificateId)
                .FirstOrDefaultAsync();
            if (accessAssignment != null)
            {
                if (accessAssignment.AccessLevel == CertificateAccessLevel.View)
                    return true;
                accessAssignment.AccessLevel = CertificateAccessLevel.View;
                _dbContext.CertificateAccessLists.Update(accessAssignment);
                return await _dbContext.SaveChangesAsync() > 0;
            }
            return false;
        }

    }
}
