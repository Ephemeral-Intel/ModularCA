using System.Text.Json;

namespace ModularCA.Shared.Models.Acme;

/// <summary>
/// Request body for ACME new-account endpoint (RFC 8555 section 7.3).
/// </summary>
public class CreateAcmeAccountRequest
{
    public bool TermsOfServiceAgreed { get; set; }
    public List<string>? Contact { get; set; }
    public bool OnlyReturnExisting { get; set; }

    /// <summary>
    /// External Account Binding JWS object, required when the server enforces EAB (RFC 8555 section 7.3.4).
    /// </summary>
    public JsonElement? ExternalAccountBinding { get; set; }
}
