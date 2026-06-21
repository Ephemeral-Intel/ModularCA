namespace ModularCA.Shared.Interfaces;

public interface IEstService
{
    /// <summary>
    /// Returns the CA certificate chain as a DER-encoded PKCS#7/CMS certs-only message (RFC 7030 §4.1).
    /// </summary>
    Task<byte[]> GetCaCertsAsync(string? caLabel = null);

    /// <summary>
    /// Processes a base64-encoded PKCS#10 CSR for simple enrollment (RFC 7030 §4.2).
    /// Returns a DER-encoded PKCS#7/CMS containing the issued certificate.
    /// <paramref name="callerUsername"/> is compared against the CSR CN for HTTP-auth callers.
    /// </summary>
    Task<byte[]> SimpleEnrollAsync(string base64Csr, string? caLabel = null, string? sourceIp = null,
        System.Security.Cryptography.X509Certificates.X509Certificate2? clientCert = null, bool isAuthenticated = false,
        string? callerUsername = null);

    /// <summary>
    /// Processes a base64-encoded PKCS#10 CSR for re-enrollment / renewal (RFC 7030 §4.2.2).
    /// Returns a DER-encoded PKCS#7/CMS containing the issued certificate.
    /// </summary>
    Task<byte[]> SimpleReenrollAsync(string base64Csr, string? caLabel = null, string? sourceIp = null,
        System.Security.Cryptography.X509Certificates.X509Certificate2? clientCert = null, bool isAuthenticated = false,
        string? callerUsername = null);

    /// <summary>
    /// Returns the DER-encoded CSR attributes the server requires (RFC 7030 §4.5).
    /// </summary>
    byte[] GetCsrAttributes();
}
