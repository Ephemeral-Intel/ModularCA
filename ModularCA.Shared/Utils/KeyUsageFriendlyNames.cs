using Org.BouncyCastle.Asn1.X509;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Shared helper for translating cert-profile friendly-name strings (e.g.
    /// "Digital Signature", "Key Certificate Signing") into <see cref="KeyUsage"/>
    /// bit flags. Centralizes what used to be two near-identical copies of the same
    /// map in <c>CertificateBuilderService</c> and <c>IssuanceValidationService</c>.
    /// <para>
    /// Fails closed on unknown names: the caller receives an <see cref="InvalidOperationException"/>
    /// instead of a silent <c>-1</c>. That way a typo in a profile's KeyUsages JSON
    /// (e.g. "Digital Signatur") aborts issuance rather than quietly shipping a cert
    /// with a missing usage bit.
    /// </para>
    /// </summary>
    public static class KeyUsageFriendlyNames
    {
        /// <summary>
        /// Parses a single friendly-name string into its BouncyCastle
        /// <see cref="KeyUsage"/> bit flag.
        /// </summary>
        /// <param name="name">
        /// Friendly name (case-insensitive, trimmed). Accepted values:
        /// "Digital Signature", "Non Repudiation", "Key Encipherment",
        /// "Data Encipherment", "Key Agreement", "Key Certificate Signing",
        /// "CRL Signing", "Encipher Only", "Decipher Only".
        /// </param>
        /// <returns>The <see cref="KeyUsage"/> bit flag.</returns>
        /// <exception cref="InvalidOperationException">
        /// Thrown when <paramref name="name"/> does not match any known friendly
        /// name. Issuance must abort so the profile author notices the typo.
        /// </exception>
        public static int Parse(string name)
        {
            return name.Trim().ToLowerInvariant() switch
            {
                "digital signature" => KeyUsage.DigitalSignature,
                "non repudiation" => KeyUsage.NonRepudiation,
                "key encipherment" => KeyUsage.KeyEncipherment,
                "data encipherment" => KeyUsage.DataEncipherment,
                "key agreement" => KeyUsage.KeyAgreement,
                "key certificate signing" => KeyUsage.KeyCertSign,
                "crl signing" => KeyUsage.CrlSign,
                "encipher only" => KeyUsage.EncipherOnly,
                "decipher only" => KeyUsage.DecipherOnly,
                _ => throw new InvalidOperationException(
                    $"Unknown key usage friendly name: '{name}'. " +
                    "Expected one of: 'Digital Signature', 'Non Repudiation', 'Key Encipherment', " +
                    "'Data Encipherment', 'Key Agreement', 'Key Certificate Signing', 'CRL Signing', " +
                    "'Encipher Only', 'Decipher Only'.")
            };
        }

        /// <summary>
        /// Combines a list of friendly names into a single OR-ed <see cref="KeyUsage"/>
        /// bit mask. Returns <c>0</c> when the list is empty.
        /// </summary>
        /// <param name="names">List of friendly names.</param>
        /// <returns>Bitwise-OR of every parsed <see cref="KeyUsage"/> bit.</returns>
        /// <exception cref="InvalidOperationException">
        /// Thrown when any entry in <paramref name="names"/> is unrecognized.
        /// </exception>
        public static int ParseMany(IEnumerable<string> names)
        {
            int flags = 0;
            foreach (var name in names)
            {
                flags |= Parse(name);
            }
            return flags;
        }
    }
}
