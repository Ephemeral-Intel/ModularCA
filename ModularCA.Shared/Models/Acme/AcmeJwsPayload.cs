using System.Text.Json;

namespace ModularCA.Shared.Models.Acme;

public class AcmeJwsPayload
{
    public string ProtectedHeader { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public string Signature { get; set; } = string.Empty;

    public string? Kid { get; set; }
    public JsonElement? Jwk { get; set; }
    public string? Nonce { get; set; }
    public string? Url { get; set; }

    public Guid? AccountId { get; set; }
    public string? JwkThumbprint { get; set; }
}
