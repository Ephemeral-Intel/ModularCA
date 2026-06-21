namespace ModularCA.Shared.Models
{
    public class CertificateCsrRequestModel
    {
        public byte[] CsrBytes { get; set; } = [];
        public Guid SigningProfileId { get; set; }
        public DateTime NotBefore { get; set; }
        public DateTime NotAfter { get; set; }
        public bool IsCA { get; set; } = false;
    }
}
