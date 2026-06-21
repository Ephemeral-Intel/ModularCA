namespace ModularCA.Auth.Interfaces
{
    /// <summary>
    /// Assigns, downgrades, or revokes per-certificate access control entries for individual users.
    /// </summary>
    public interface ICertificateAccessAssignment
    {
        /// <summary>Grants view-level access to a certificate for the specified user.</summary>
        public Task<bool> AssignCertificateViewAccessAsync(Guid userId, Guid certificateId);

        /// <summary>Grants manage-level access to a certificate for the specified user.</summary>
        public Task<bool> AssignCertificateManageAccessAsync(Guid userId, Guid certificateId);

        /// <summary>Removes all access for the specified user on the certificate.</summary>
        public Task<bool> RevokeCertificateAccessAsync(Guid userId, Guid certificateId);

        /// <summary>Downgrades manage-level access to view-level for the specified user.</summary>
        public Task<bool> DowngradeCertificateManageAccessAsync(Guid userId, Guid certificateId);
    }
}
