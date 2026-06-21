namespace ModularCA.Shared.Models
{
    public class CertificateInfoModel
    {
        public Guid CertificateId { get; set; } // <- Required for GET /cert/{id}
        public string Pem { get; set; } = string.Empty; // <- Required to return the PEM

        public string SubjectDN { get; set; } = string.Empty;
        public string Issuer { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public DateTime NotBefore { get; set; }
        public DateTime NotAfter { get; set; }
        public string? Thumbprints { get; set; } = string.Empty;

        public List<string> SubjectAlternativeNames { get; set; } = new();
        public List<string> KeyUsages { get; set; } = new();
        public List<string> ExtendedKeyUsages { get; set; } = new();

        public bool IsCA { get; set; }

        public string KeyAlgorithm { get; set; } = string.Empty;
        public string KeySize { get; set; } = string.Empty;
        public string SignatureAlgorithm { get; set; } = string.Empty;

        public byte[]? Iv { get; set; }
        public byte[]? EncryptedAesKey { get; set; }
        public byte[]? EncryptedPrivateKey { get; set; }

        /// <summary>Serial number of the certificate whose public key was used to encrypt EncryptedPrivateKey.</summary>
        public string? EncryptionCertSerialNumber { get; set; }

        public bool Revoked { get; set; }
        public string RevocationReason { get; set; } = string.Empty;

        public DateTime? RevocationDate { get; set; }
        public Guid SigningProfileId { get; set; }
        public Guid CertProfileId { get; set; }

        /// <summary>
        /// FK to the issuing CA's <see cref="CertificateId"/>.
        /// Populated by the issuance path so <c>CertificateStore.SaveCertificateAsync</c>
        /// can persist it directly instead of relying on the CRL service's
        /// DN-based fallback resolution.
        /// </summary>
        public Guid? IssuerCertificateId { get; set; }

    }
}