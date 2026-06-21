namespace ModularCA.Shared.Models.Acme;

public class AcmeChallengeDto
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? ValidatedAt { get; set; }
}
