namespace ModularCA.Shared.Models;

/// <summary>
/// Parsed X.509 certificate extensions including AIA, CDP, Basic Constraints,
/// Key Usage, Extended Key Usage, SANs, SKI, AKI, and Certificate Policies.
/// </summary>
public class CertificateExtensionsModel
{
    /// <summary>
    /// Basic Constraints: whether the certificate is a CA and the optional path length constraint.
    /// </summary>
    public BasicConstraintsInfo? BasicConstraints { get; set; }

    /// <summary>
    /// Key Usage flags present on the certificate (e.g. DigitalSignature, KeyCertSign).
    /// </summary>
    public List<string> KeyUsage { get; set; } = new();

    /// <summary>
    /// Extended Key Usage OID friendly names (e.g. ServerAuth, ClientAuth).
    /// </summary>
    public List<string> ExtendedKeyUsage { get; set; } = new();

    /// <summary>
    /// Subject Alternative Names as type:value pairs (e.g. DNS:example.com, IP:10.0.0.1).
    /// </summary>
    public List<string> SubjectAlternativeNames { get; set; } = new();

    /// <summary>
    /// Authority Information Access entries (OCSP responder URLs and CA issuer URLs).
    /// </summary>
    public AuthorityInfoAccessInfo? AuthorityInformationAccess { get; set; }

    /// <summary>
    /// CRL Distribution Point URLs.
    /// </summary>
    public List<string> CrlDistributionPoints { get; set; } = new();

    /// <summary>
    /// Subject Key Identifier as a colon-separated hex string.
    /// </summary>
    public string? SubjectKeyIdentifier { get; set; }

    /// <summary>
    /// Authority Key Identifier as a colon-separated hex string.
    /// </summary>
    public string? AuthorityKeyIdentifier { get; set; }

    /// <summary>
    /// Certificate Policy OIDs.
    /// </summary>
    public List<string> CertificatePolicies { get; set; } = new();
}

/// <summary>
/// Basic Constraints extension details.
/// </summary>
public class BasicConstraintsInfo
{
    /// <summary>
    /// Whether the certificate is a Certificate Authority.
    /// </summary>
    public bool IsCA { get; set; }

    /// <summary>
    /// Maximum path length constraint. Null if not specified.
    /// </summary>
    public int? PathLength { get; set; }
}

/// <summary>
/// Authority Information Access extension with OCSP and CA Issuer URLs.
/// </summary>
public class AuthorityInfoAccessInfo
{
    /// <summary>
    /// OCSP responder URLs.
    /// </summary>
    public List<string> OcspUrls { get; set; } = new();

    /// <summary>
    /// CA Issuer certificate URLs.
    /// </summary>
    public List<string> CaIssuerUrls { get; set; } = new();
}
