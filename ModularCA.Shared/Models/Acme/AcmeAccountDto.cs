namespace ModularCA.Shared.Models.Acme;

public class AcmeAccountDto
{
    public Guid Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<string> Contact { get; set; } = [];
    public bool TermsOfServiceAgreed { get; set; }
    public DateTime CreatedAt { get; set; }
}
