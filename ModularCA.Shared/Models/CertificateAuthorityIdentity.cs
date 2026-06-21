using ModularCA.Shared.Interfaces;
using Org.BouncyCastle.X509;

namespace ModularCA.Shared.Models
{
    // Identity describing a CA: its public certificate and an optional private-key handle.
    // The private key is represented by IPrivateKeyHandle so implementations can use
    // software-backed keys or HSM-backed handles without exposing raw key material.
    public record CertificateAuthorityIdentity(
        X509Certificate PublicCertificate,
        IPrivateKeyHandle? PrivateKeyHandle
    );
}
