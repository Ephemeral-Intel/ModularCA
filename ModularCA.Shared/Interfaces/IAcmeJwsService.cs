using ModularCA.Shared.Models.Acme;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Handles ACME JWS (JSON Web Signature) parsing, verification, and thumbprint computation.
/// </summary>
public interface IAcmeJwsService
{
    /// <summary>
    /// Parses and cryptographically verifies an ACME JWS request body.
    /// </summary>
    Task<AcmeJwsPayload> ParseAndVerifyAsync(string rawBody, string requestUrl);

    /// <summary>
    /// Computes the JWK thumbprint (RFC 7638) for the given JWK JSON.
    /// </summary>
    string ComputeThumbprint(string jwkJson);

    /// <summary>
    /// Verifies a JWS signature using the specified JWK.
    /// </summary>
    void VerifySignature(string protectedB64, string payloadB64, string signatureB64, string jwkJson);
}
