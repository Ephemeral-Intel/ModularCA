using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Pkcs;

namespace ModularCA.Shared.Interfaces
{
    /// <summary>
    /// Parses PKCS#10 certificate signing requests and extracts subject and key information.
    /// </summary>
    public interface ICsrParserService
    {
        /// <summary>
        /// Parses a PEM-encoded CSR string into a PKCS#10 certification request object.
        /// </summary>
        Pkcs10CertificationRequest ParseFromPem(string pem);

        /// <summary>
        /// Extracts the subject distinguished name from a parsed CSR.
        /// </summary>
        string ExtractSubject(Pkcs10CertificationRequest csr);

        /// <summary>
        /// Extracts the public key from a parsed CSR.
        /// </summary>
        AsymmetricKeyParameter ExtractPublicKey(Pkcs10CertificationRequest csr);
    }
}
