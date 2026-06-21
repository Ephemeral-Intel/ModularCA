namespace ModularCA.Shared.Models.Acme;

public class AcmeRevokeCertRequest
{
    public string Certificate { get; set; } = string.Empty;
    public int? Reason { get; set; }
}
