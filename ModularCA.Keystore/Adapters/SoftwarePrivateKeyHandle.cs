using ModularCA.Shared.Interfaces;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Security;

namespace ModularCA.Keystore.Adapters
{
    /// <summary>
    /// Software-backed implementation of <see cref="IPrivateKeyHandle"/> that holds the private
    /// key in managed memory.
    ///
    /// The recommended signing path for software-backed keys is
    /// <see cref="Sign(byte[], string)"/> via the
    /// <c>PrivateKeyHandleSignatureFactory</c> BouncyCastle adapter rather than
    /// <see cref="ExportPrivateKeyDer"/>. Exporting is still supported by default
    /// (<c>CanExport = true</c>) for callers that need raw key material (CMS decryption in
    /// SCEP / cert export / issuance, TimeStampTokenGenerator in TimestampService,
    /// system-signer hand-off in KeystoreService.AppendEntries). The constructor
    /// now takes an optional <paramref name="canExport"/> flag so callers who know the key
    /// should never be exported (e.g. a TSA or future HSM-protected keystore signer) can opt
    /// out at construction time — calls to <see cref="ExportPrivateKeyDer"/> on a non-exportable
    /// software handle throw <see cref="NotSupportedException"/> to match the Pkcs11 behaviour.
    /// Once every export site is either migrated to <see cref="Sign(byte[], string)"/> or
    /// explicitly flagged as "must export," the default can flip to <c>false</c> in a future
    /// pass.
    /// </summary>
    public class SoftwarePrivateKeyHandle : IPrivateKeyHandle
    {
        private readonly AsymmetricKeyParameter _privateKey;

        /// <summary>
        /// Creates a new software-backed private key handle. <paramref name="canExport"/>
        /// defaults to <c>true</c> to preserve existing call sites; passing <c>false</c>
        /// declares that this key must never be materialised as raw DER, in which case
        /// <see cref="ExportPrivateKeyDer"/> will throw.
        /// </summary>
        public SoftwarePrivateKeyHandle(AsymmetricKeyParameter privateKey, bool canExport = true)
        {
            _privateKey = privateKey ?? throw new ArgumentNullException(nameof(privateKey));
            CanExport = canExport;
        }

        /// <inheritdoc />
        public bool CanExport { get; }

        /// <summary>
        /// Exports the private key in DER-encoded PKCS#8 format when <see cref="CanExport"/>
        /// is <c>true</c>. Throws <see cref="NotSupportedException"/> when the handle was
        /// constructed with <c>canExport: false</c>. Callers MUST zero the returned buffer
        /// with
        /// <see cref="System.Security.Cryptography.CryptographicOperations.ZeroMemory(Span{byte})"/>
        /// once the raw key material is no longer needed. Prefer
        /// <see cref="Sign(byte[], string)"/> for any signing operation — it keeps the key
        /// in this handle and off the caller's managed heap.
        /// </summary>
        public byte[]? ExportPrivateKeyDer()
        {
            if (!CanExport)
                throw new NotSupportedException(
                    "Software-backed private key handle was created with canExport=false. " +
                    "Use Sign(byte[], string) to perform cryptographic operations without materialising the raw key.");

            var pkInfo = PrivateKeyInfoFactory.CreatePrivateKeyInfo(_privateKey);
            return pkInfo.GetDerEncoded();
        }

        /// <summary>
        /// Signs the given data using the specified algorithm and returns the signature bytes.
        /// </summary>
        public byte[] Sign(byte[] data, string algorithm)
        {
            var signer = SignerUtilities.GetSigner(algorithm);
            signer.Init(true, _privateKey);
            signer.BlockUpdate(data, 0, data.Length);
            return signer.GenerateSignature();
        }
    }
}
