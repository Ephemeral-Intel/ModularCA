namespace ModularCA.Shared.Models.Acme;

public class AcmeErrorResponse
{
    public string Type { get; set; } = string.Empty;
    public string Detail { get; set; } = string.Empty;
    public int Status { get; set; }
    public List<AcmeErrorResponse>? Subproblems { get; set; }
    public AcmeIdentifier? Identifier { get; set; }
}
