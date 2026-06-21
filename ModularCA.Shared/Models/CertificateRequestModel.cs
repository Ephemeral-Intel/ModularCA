namespace ModularCA.Shared.Models;

public class CertificateRequestModel
{
    // === Subject DN ===
    public string CommonName { get; set; } = string.Empty;
    public string Organization { get; set; } = string.Empty;
    public string OrganizationalUnit { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Locality { get; set; } = string.Empty;
    public string EmailAddress { get; set; } = string.Empty;

    // === Keypair ===
    public string KeyAlgorithm { get; set; } = "RSA"; // RSA, ECDSA, Ed25519, Ed448, DILITHIUM, SPHINCSPLUS
    public int KeySize { get; set; } = 2048;

    // === Validity ===
    public DateTime NotBefore { get; set; } = DateTime.UtcNow;
    public DateTime NotAfter { get; set; } = DateTime.UtcNow.AddYears(1);

    // === Basic Constraints ===
    public bool IsCA { get; set; } = false;
    public int? PathLenConstraint { get; set; } = null;

    // === Extensions ===
    public List<string> SubjectAlternativeNames { get; set; } = new(); // e.g., DNS:example.com, IP:192.168.0.1
    public List<string> KeyUsages { get; set; } = new();              // e.g., digitalSignature, keyEncipherment
    public List<string> ExtendedKeyUsages { get; set; } = new();      // e.g., serverAuth, clientAuth
    public List<string> CRLDistributionPoints { get; set; } = new(); // optional CRL URLs
    public List<string> AuthorityInformationAccess { get; set; } = new(); // OCSP or CA issuer URLs

    // === Optional Metadata ===
    public string? SerialNumberOverride { get; set; } = null;
    public string? SubjectUniqueId { get; set; } = null;
    public string? IssuerUniqueId { get; set; } = null;

    // === Profile/Policy Linkage ===
    public Guid? SigningProfileId { get; set; } = null;

    public string? CsrPem { get; set; } // Optional CSR in PEM format
    public bool StorePrivateKey { get; set; } = false; // New: allow storing private key (optional)

}
