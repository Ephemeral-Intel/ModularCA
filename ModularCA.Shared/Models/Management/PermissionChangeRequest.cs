namespace ModularCA.Shared.Models.Management
{
    public class PermissionChangeRequest
    {
        public string UserId { get; set; } = string.Empty;
        public string CertId { get; set; } = string.Empty;
    }

    /// <summary>Body for the serial-based cert-ACL set/revoke endpoints. <see cref="AccessLevel"/> is
    /// "View" or "Manage" (ignored by the revoke endpoint).</summary>
    public class SetCertPermissionRequest
    {
        /// <summary>The target user id (GUID) whose ACL entry is set/removed.</summary>
        public string UserId { get; set; } = string.Empty;

        /// <summary>"View" (default) or "Manage".</summary>
        public string AccessLevel { get; set; } = "View";
    }
}
