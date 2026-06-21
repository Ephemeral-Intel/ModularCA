namespace ModularCA.Shared.Models.Issuance
{
    public class IssueCertificateRequest
    {
        public Guid CsrId { get; set; }
        public DateTime? NotBefore { get; set; }
        public DateTime? NotAfter { get; set; }
    }
}
