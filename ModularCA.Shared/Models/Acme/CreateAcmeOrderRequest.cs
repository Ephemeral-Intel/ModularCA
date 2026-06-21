namespace ModularCA.Shared.Models.Acme;

public class CreateAcmeOrderRequest
{
    public List<AcmeIdentifier> Identifiers { get; set; } = [];
    public DateTime? NotBefore { get; set; }
    public DateTime? NotAfter { get; set; }
}
