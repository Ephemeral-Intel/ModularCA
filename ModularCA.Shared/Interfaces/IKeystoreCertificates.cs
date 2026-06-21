using ModularCA.Shared.Models;
using Org.BouncyCastle.X509;

namespace ModularCA.Shared.Interfaces;

public interface IKeystoreCertificates
{
    /// <summary>
    /// Returns all trusted CA certificates (public certs, no private keys).
    /// </summary>
    List<X509Certificate> GetTrustedAuthorities();

    /// <summary>
    /// Returns all signing-capable CA identities (must include private key).
    /// </summary>
    List<CertificateAuthorityIdentity> GetSigners();

    /// <summary>
    /// Attempts to retrieve the private key for the specified certificate.
    /// Returns null if not available.
    /// </summary>
    IPrivateKeyHandle? GetPrivateKeyFor(X509Certificate cert);
}
