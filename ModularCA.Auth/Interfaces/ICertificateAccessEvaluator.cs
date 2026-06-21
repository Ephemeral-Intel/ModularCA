namespace ModularCA.Auth.Interfaces
{
    /// <summary>
    /// Evaluates whether a user can view or manage a specific certificate based on
    /// the CA-scoped group-role model and per-certificate ACL entries.
    /// </summary>
    public interface ICertificateAccessEvaluator
    {
        /// <summary>
        /// Returns true if the user can view the certificate (system admin/operator/auditor,
        /// CA-scoped group member, or explicit ACL entry).
        /// </summary>
        bool CanViewCertificate(Guid userId, Guid certificateId);

        /// <summary>
        /// Returns true if the user can manage the certificate (revoke, export private key, etc.).
        /// </summary>
        bool CanManageCertificate(Guid userId, Guid certificateId);
    }
}
