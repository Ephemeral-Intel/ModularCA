using ModularCA.Shared.Interfaces;
using Org.BouncyCastle.Asn1.X509;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Operators.Utilities;

namespace ModularCA.Keystore.Adapters
{
    /// <summary>
    /// BouncyCastle ISignatureFactory adapter that delegates signing to an IPrivateKeyHandle (supports HSM-backed keys).
    /// Supports traditional (RSA, ECDSA, EdDSA) and post-quantum (ML-DSA, SLH-DSA) algorithms.
    /// The algorithm name is resolved via <see cref="DefaultSignatureAlgorithmFinder"/> which handles
    /// PQC OID mapping in BouncyCastle 2.6.2+.
    /// </summary>
    public class PrivateKeyHandleSignatureFactory : ISignatureFactory
    {
        private readonly AlgorithmIdentifier _algId;
        private readonly string _algName;
        private readonly IPrivateKeyHandle _handle;

        public PrivateKeyHandleSignatureFactory(string algorithmName, IPrivateKeyHandle handle)
        {
            _algName = algorithmName;
            _handle = handle ?? throw new ArgumentNullException(nameof(handle));
            // Find appropriate AlgorithmIdentifier for the algorithm name
            _algId = DefaultSignatureAlgorithmFinder.Instance.Find(algorithmName);
        }

        public object AlgorithmDetails => _algId;

        /// <summary>
        /// Creates a stream calculator that collects TBS data and delegates signing to the key handle.
        /// </summary>
        public IStreamCalculator<IBlockResult> CreateCalculator()
        {
            return new StreamCalculator(_handle, _algName);
        }

        private class StreamCalculator : IStreamCalculator<IBlockResult>
        {
            private readonly MemoryStream _ms = new();
            private readonly IPrivateKeyHandle _handle;
            private readonly string _alg;

            public StreamCalculator(IPrivateKeyHandle handle, string alg)
            {
                _handle = handle;
                _alg = alg;
            }

            public Stream Stream => _ms;

            // Called by BouncyCastle after writing the TBSCertificate bytes.
            public IBlockResult GetResult()
            {
                var tbs = _ms.ToArray();
                // Delegate to HSM / key handle to sign the TBS bytes (or the digest depending on API)
                var signature = _handle.Sign(tbs, _alg);
                return new SimpleBlockResult(signature);
            }
        }

        // Simple wrapper implementing IBlockResult expected by BouncyCastle
        private class SimpleBlockResult : IBlockResult
        {
            private readonly byte[] _sig;
            public SimpleBlockResult(byte[] sig) => _sig = sig ?? throw new ArgumentNullException(nameof(sig));

            // Return signature as byte[]
            public byte[] Collect() => _sig;

            // Copy signature into provided buffer at offset, return bytes written
            public int Collect(byte[] output, int outOff)
            {
                if (output == null) throw new ArgumentNullException(nameof(output));
                if (outOff < 0) throw new ArgumentOutOfRangeException(nameof(outOff), "Offset cannot be negative");
                if (outOff > output.Length - _sig.Length) throw new ArgumentOutOfRangeException(nameof(outOff), "Output buffer is too small");
                Array.Copy(_sig, 0, output, outOff, _sig.Length);
                return _sig.Length;
            }

            // Span-based copy, return bytes written
            public int Collect(Span<byte> output)
            {
                if (output.Length < _sig.Length)
                    throw new ArgumentException($"Output buffer must be at least {_sig.Length} bytes", nameof(output));
                _sig.AsSpan().CopyTo(output);
                return _sig.Length;
            }

            public int GetMaxResultLength() => _sig.Length;
        }
    }
}
