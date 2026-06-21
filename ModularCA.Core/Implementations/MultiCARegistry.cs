using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models;
using Org.BouncyCastle.X509;

namespace ModularCA.Core.Implementations
{
    /// <summary>
    /// In-memory registry of CA signing identities and trusted certificates loaded from keystores.
    /// Supports dynamic registration of new CAs at runtime (e.g. intermediate CA creation).
    /// </summary>
    public class MultiCARegistry(List<CertificateAuthorityIdentity> signers, List<X509Certificate> trusted) : IKeystoreCertificates
    {
        private readonly object _lock = new();
        private readonly List<CertificateAuthorityIdentity> _signers = signers.ToList();
        private readonly List<X509Certificate> _trusted = trusted.ToList();

        public List<X509Certificate> GetTrustedAuthorities() { lock (_lock) return _trusted.ToList(); }

        public List<CertificateAuthorityIdentity> GetSigners() { lock (_lock) return _signers.ToList(); }

        public IPrivateKeyHandle? GetPrivateKeyFor(X509Certificate cert)
        {
            // Match by SKI/SPKI (SHA-256 over the DER-encoded public key) when
            // available so two signers with the same SubjectDN but different keys can't be
            // silently swapped at lookup time. Falls back to SerialNumber+SubjectDN match
            // for backwards compatibility when SKI computation isn't feasible for the input.
            lock (_lock)
            {
                var targetSpki = TryComputeSpkiHash(cert);
                if (targetSpki != null)
                {
                    var bySpki = _signers.FirstOrDefault(s =>
                    {
                        var spki = TryComputeSpkiHash(s.PublicCertificate);
                        return spki != null && spki.AsSpan().SequenceEqual(targetSpki.AsSpan());
                    });
                    if (bySpki != null) return bySpki.PrivateKeyHandle;
                }

                return _signers.FirstOrDefault(s =>
                    s.PublicCertificate.SerialNumber.Equals(cert.SerialNumber) &&
                    s.PublicCertificate.SubjectDN.Equivalent(cert.SubjectDN))?.PrivateKeyHandle;
            }
        }

        /// <summary>
        /// SHA-256 over the DER-encoded SubjectPublicKeyInfo for disambiguation.
        /// </summary>
        private static byte[]? TryComputeSpkiHash(X509Certificate cert)
        {
            try
            {
                var spki = Org.BouncyCastle.X509.SubjectPublicKeyInfoFactory
                    .CreateSubjectPublicKeyInfo(cert.GetPublicKey())
                    .GetDerEncoded();
                return System.Security.Cryptography.SHA256.HashData(spki);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Registers a new CA signer identity and its trusted certificate at runtime.
        /// De-duplicates by SHA-256 over the DER-encoded SubjectPublicKeyInfo so a race
        /// between two concurrent registration paths does not produce two signer rows with
        /// the same public key. Falls back to SerialNumber+SubjectDN matching when SPKI
        /// computation fails for the input cert.
        /// </summary>
        public void RegisterSigner(CertificateAuthorityIdentity signer)
        {
            lock (_lock)
            {
                var incomingSpki = TryComputeSpkiHash(signer.PublicCertificate);
                var duplicate = false;

                if (incomingSpki != null)
                {
                    duplicate = _signers.Any(s =>
                    {
                        var spki = TryComputeSpkiHash(s.PublicCertificate);
                        return spki != null && spki.AsSpan().SequenceEqual(incomingSpki.AsSpan());
                    });
                }

                if (!duplicate)
                {
                    duplicate = _signers.Any(s =>
                        s.PublicCertificate.SerialNumber.Equals(signer.PublicCertificate.SerialNumber) &&
                        s.PublicCertificate.SubjectDN.Equivalent(signer.PublicCertificate.SubjectDN));
                }

                if (!duplicate)
                    _signers.Add(signer);

                if (!_trusted.Any(t => t.SerialNumber.Equals(signer.PublicCertificate.SerialNumber)))
                    _trusted.Add(signer.PublicCertificate);
            }
        }

        /// <summary>
        /// Symmetric to <see cref="RegisterSigner"/>. Removes a CA signer (and its
        /// trusted certificate entry) from the registry. Called by failure-handling paths in
        /// <see cref="ModularCA.Core.Services.CaCreationService"/> so the registry never holds
        /// a live entry for a CA whose post-DB-commit steps (CRL generation, etc.) failed.
        /// The match is on serial number because that's what the creation path passes.
        /// </summary>
        /// <param name="serial">Serial number of the signer to remove.</param>
        /// <returns>True if a signer was removed.</returns>
        public bool UnregisterSigner(Org.BouncyCastle.Math.BigInteger serial)
        {
            lock (_lock)
            {
                var removed = false;
                var victim = _signers.FirstOrDefault(s => s.PublicCertificate.SerialNumber.Equals(serial));
                if (victim != null)
                {
                    _signers.Remove(victim);
                    removed = true;
                }
                var trustedVictim = _trusted.FirstOrDefault(t => t.SerialNumber.Equals(serial));
                if (trustedVictim != null)
                {
                    _trusted.Remove(trustedVictim);
                    removed = true;
                }
                return removed;
            }
        }

        /// <summary>
        /// Registers an external CA certificate as a trusted authority for cross-certification.
        /// The certificate is added to the trusted list without a private key (public trust only).
        /// </summary>
        /// <param name="cert">The external CA certificate to trust.</param>
        public void RegisterTrustedCert(X509Certificate cert)
        {
            lock (_lock)
            {
                if (!_trusted.Any(t => t.SerialNumber.Equals(cert.SerialNumber)))
                    _trusted.Add(cert);
            }
        }
    }
}