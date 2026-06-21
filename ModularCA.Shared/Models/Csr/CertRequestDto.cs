namespace ModularCA.Shared.Models.Csr
{
    public class CertRequestDto
    {
        public Guid RequestId { get; set; } = Guid.Empty;
        public string SubjectName { get; set; } = default!;  // e.g., "CN=example.com,O=ModularCA"
        public List<String>? SubjectAlternativeNames { get; set; } // optional SANs
        public string KeyAlgorithm { get; set; } = string.Empty;
        public string SignatureAlgorithm { get; set; } = string.Empty;
        public string KeySize { get; set; } = string.Empty;
        public string Status { get; set; } = "Pending";
        public DateTime SubmittedAt { get; set; }
        public Guid SigningProfileId { get; set; }
        public Guid CertificateProfileId { get; set; }
        public Guid RequestorUserId { get; set; }
        public string? RequestorUsername { get; set; }
        public string? RejectionReason { get; set; }
        public Guid? IssuedCertificateId { get; set; }
    }
}
