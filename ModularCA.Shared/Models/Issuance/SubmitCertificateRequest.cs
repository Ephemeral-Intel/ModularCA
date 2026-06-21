namespace ModularCA.Shared.Models.Issuance;

public class SubmitCertificateRequest
{
    public string CsrPem { get; set; } = string.Empty;
    public Guid SigningProfileId { get; set; }
}
