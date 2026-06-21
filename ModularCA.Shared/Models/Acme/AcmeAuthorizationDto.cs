namespace ModularCA.Shared.Models.Acme;

public class AcmeAuthorizationDto
{
    public Guid Id { get; set; }
    public AcmeIdentifier Identifier { get; set; } = new();
    public string Status { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public bool IsWildcard { get; set; }
    public List<AcmeChallengeDto> Challenges { get; set; } = [];
}
