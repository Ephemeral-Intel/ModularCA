namespace ModularCA.Shared.Models.Acme;

public class AcmeOrderDto
{
    public Guid Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<AcmeIdentifier> Identifiers { get; set; } = [];
    public DateTime? NotBefore { get; set; }
    public DateTime? NotAfter { get; set; }
    public DateTime ExpiresAt { get; set; }
    public List<string> Authorizations { get; set; } = [];
    public string Finalize { get; set; } = string.Empty;
    public string? Certificate { get; set; }
}
