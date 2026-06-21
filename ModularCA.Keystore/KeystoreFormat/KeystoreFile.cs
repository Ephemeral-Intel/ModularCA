namespace ModularCA.Keystore.KeystoreFormat
{
    /// <summary>
    /// Represents a parsed MCAKSTR keystore file with scrypt parameters, encrypted entries, and a single file-level signature.
    /// </summary>
    public class KeystoreFile
    {
        public string Type { get; set; } = "MCAKSTR";
        public string KeyAlg { get; set; } = "AES";
        public string Enc { get; set; } = "AES-256-GCM";

        /// <summary>
        /// On-disk MCAKSTR format version. Parsed from the magic header.
        /// <c>0x02</c> is the legacy format with raw <c>main + secondary</c> string
        /// concatenation as the scrypt input; <c>0x03</c> uses a length-prefixed UTF-8
        /// encoding for domain separation between the two passphrase components.
        /// <see cref="ModularCA.Keystore.Crypto.KeystoreFileParser"/> accepts both; new
        /// writes always emit the current value set by
        /// <see cref="ModularCA.Keystore.Crypto.KeystoreFileWriter"/>.
        /// </summary>
        public int FormatVersion { get; set; } = 3;

        public string ScryptSalt { get; set; } = string.Empty;
        public int ScryptN { get; set; }
        public int ScryptR { get; set; }
        public int ScryptP { get; set; }

        /// <summary>
        /// Single file-level signature from the system CA.
        /// </summary>
        public byte[]? FileSignature { get; set; }

        public List<KeystoreEntry> Entries { get; set; } = new();

        /// <summary>
        /// Returns the scrypt salt decoded from its Base64 representation.
        /// </summary>
        public byte[] GetSaltBytes() => Convert.FromBase64String(ScryptSalt);

        /// <summary>
        /// A single encrypted keystore entry with its nonce, ciphertext, authentication tag, and signature.
        /// </summary>
        public record KeystoreEntry(
            byte[] Nonce,
            byte[] Ciphertext,
            byte[] Tag,
            byte[]? Signature);
    }
}
