namespace ModularCA.Shared.Models;

/// <summary>
/// Result of a certificate issuance or reissuance operation.
/// Wraps the PEM-encoded certificate chain and any warnings raised during issuance
/// (e.g. validity period clamped to the issuing CA's expiry).
/// </summary>
public record IssuanceResult(string Pem, List<string> Warnings)
{
    /// <summary>Creates a result with no warnings.</summary>
    public IssuanceResult(string pem) : this(pem, new List<string>()) { }
}
