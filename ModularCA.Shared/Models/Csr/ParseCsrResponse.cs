namespace ModularCA.Shared.Models.Csr;

/// <summary>
/// Structured response from parsing a PEM-encoded CSR, containing subject DN fields,
/// SANs, key information, requested extensions, and validation status.
/// </summary>
public class ParseCsrResponse
{
    /// <summary>
    /// Individual subject DN components keyed by field name (CN, O, OU, L, ST, C, etc.).
    /// </summary>
    public Dictionary<string, string> Subject { get; set; } = new();

    /// <summary>
    /// Subject Alternative Names extracted from the CSR extensions.
    /// </summary>
    public List<SanEntry> Sans { get; set; } = new();

    /// <summary>
    /// Key algorithm name (RSA, ECDSA, Ed25519, etc.).
    /// </summary>
    public string KeyAlgorithm { get; set; } = string.Empty;

    /// <summary>
    /// Key size in bits (for RSA) or curve name (for ECDSA).
    /// </summary>
    public string KeySize { get; set; } = string.Empty;

    /// <summary>
    /// Signature algorithm used to sign the CSR (e.g. SHA256withRSA).
    /// </summary>
    public string SignatureAlgorithm { get; set; } = string.Empty;

    /// <summary>
    /// Extensions requested in the CSR (key usage, extended key usage, etc.).
    /// </summary>
    public CsrRequestedExtensions RequestedExtensions { get; set; } = new();

    /// <summary>
    /// Whether the CSR signature is cryptographically valid.
    /// </summary>
    public bool Valid { get; set; }

    /// <summary>
    /// Any validation errors found (e.g. invalid signature).
    /// </summary>
    public List<string> ValidationErrors { get; set; } = new();
}

/// <summary>
/// A single Subject Alternative Name entry with its type and value.
/// </summary>
public class SanEntry
{
    /// <summary>SAN type: DNS, IP, Email, URI.</summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>SAN value.</summary>
    public string Value { get; set; } = string.Empty;
}

/// <summary>
/// Extensions requested within the CSR.
/// </summary>
public class CsrRequestedExtensions
{
    /// <summary>Key usage flags (e.g. digitalSignature, keyEncipherment).</summary>
    public List<string> KeyUsage { get; set; } = new();

    /// <summary>Extended key usage OIDs (e.g. 1.3.6.1.5.5.7.3.1 for serverAuth).</summary>
    public List<string> ExtendedKeyUsage { get; set; } = new();
}
