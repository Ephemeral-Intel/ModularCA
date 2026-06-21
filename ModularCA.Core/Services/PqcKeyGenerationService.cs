using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;

namespace ModularCA.Core.Services;

/// <summary>
/// Service interface for generating post-quantum cryptographic (PQC) key pairs.
/// Supports ML-DSA (CRYSTALS-Dilithium) and SLH-DSA (SPHINCS+) algorithms
/// as implemented by BouncyCastle Cryptography 2.6.2.
/// </summary>
public interface IPqcKeyGenerationService
{
    /// <summary>
    /// Generates a PQC asymmetric key pair for the specified algorithm.
    /// </summary>
    /// <param name="algorithm">The PQC algorithm name (e.g. "ML-DSA-65", "SLH-DSA-SHA2-128F").</param>
    /// <returns>The generated key pair.</returns>
    /// <exception cref="ArgumentException">Thrown when the algorithm is not supported.</exception>
    AsymmetricCipherKeyPair GenerateKeyPair(string algorithm);

    /// <summary>
    /// Checks whether the specified algorithm is a supported PQC signing algorithm.
    /// </summary>
    /// <param name="algorithm">The algorithm name to check.</param>
    /// <returns><c>true</c> if the algorithm is supported for PQC key generation.</returns>
    bool IsSupported(string algorithm);

    /// <summary>
    /// Returns the list of all supported PQC algorithm names.
    /// </summary>
    /// <returns>A list of supported algorithm identifiers.</returns>
    List<string> GetSupportedAlgorithms();
}

/// <summary>
/// Generates post-quantum cryptographic key pairs using BouncyCastle 2.6.2.
/// Supports ML-DSA (FIPS 204 / CRYSTALS-Dilithium) parameter sets ML-DSA-44, ML-DSA-65, ML-DSA-87
/// and SLH-DSA (FIPS 205 / SPHINCS+) parameter sets with SHA2 and SHAKE instantiations.
/// <para>
/// Limitations (BouncyCastle 2.6.2):
/// <list type="bullet">
///   <item>ML-KEM (CRYSTALS-Kyber) is a key encapsulation mechanism and cannot be used for signing certificates.</item>
///   <item>Composite/hybrid signatures (e.g. ML-DSA + ECDSA) are not yet available in this version.</item>
///   <item>PQC certificates can be issued, but most TLS stacks and browsers do not yet validate them.</item>
/// </list>
/// </para>
/// </summary>
public class PqcKeyGenerationService : IPqcKeyGenerationService
{
    /// <summary>
    /// Map of supported PQC algorithm names to their BouncyCastle parameter objects.
    /// ML-DSA parameters follow FIPS 204 security levels (44=level 2, 65=level 3, 87=level 5).
    /// SLH-DSA parameters follow FIPS 205 with SHA2 and SHAKE hash variants and F(ast)/S(mall) trade-offs.
    /// </summary>
    private static readonly Dictionary<string, object> SupportedAlgorithms = new(StringComparer.OrdinalIgnoreCase)
    {
        // ML-DSA (CRYSTALS-Dilithium) — FIPS 204
        ["ML-DSA-44"] = MLDsaParameters.ml_dsa_44,
        ["ML-DSA-65"] = MLDsaParameters.ml_dsa_65,
        ["ML-DSA-87"] = MLDsaParameters.ml_dsa_87,

        // SLH-DSA (SPHINCS+) — FIPS 205, SHA2 variants
        ["SLH-DSA-SHA2-128F"] = SlhDsaParameters.slh_dsa_sha2_128f,
        ["SLH-DSA-SHA2-128S"] = SlhDsaParameters.slh_dsa_sha2_128s,
        ["SLH-DSA-SHA2-192F"] = SlhDsaParameters.slh_dsa_sha2_192f,
        ["SLH-DSA-SHA2-192S"] = SlhDsaParameters.slh_dsa_sha2_192s,
        ["SLH-DSA-SHA2-256F"] = SlhDsaParameters.slh_dsa_sha2_256f,
        ["SLH-DSA-SHA2-256S"] = SlhDsaParameters.slh_dsa_sha2_256s,

        // SLH-DSA (SPHINCS+) — FIPS 205, SHAKE variants
        ["SLH-DSA-SHAKE-128F"] = SlhDsaParameters.slh_dsa_shake_128f,
        ["SLH-DSA-SHAKE-128S"] = SlhDsaParameters.slh_dsa_shake_128s,
        ["SLH-DSA-SHAKE-192F"] = SlhDsaParameters.slh_dsa_shake_192f,
        ["SLH-DSA-SHAKE-192S"] = SlhDsaParameters.slh_dsa_shake_192s,
        ["SLH-DSA-SHAKE-256F"] = SlhDsaParameters.slh_dsa_shake_256f,
        ["SLH-DSA-SHAKE-256S"] = SlhDsaParameters.slh_dsa_shake_256s,
    };

    /// <inheritdoc />
    public AsymmetricCipherKeyPair GenerateKeyPair(string algorithm)
    {
        if (!SupportedAlgorithms.TryGetValue(algorithm, out var paramObj))
            throw new ArgumentException($"Unsupported PQC algorithm: {algorithm}. Supported: {string.Join(", ", SupportedAlgorithms.Keys)}");

        var random = new SecureRandom();

        return paramObj switch
        {
            MLDsaParameters mlDsaParams => GenerateMLDsa(mlDsaParams, random),
            SlhDsaParameters slhDsaParams => GenerateSlhDsa(slhDsaParams, random),
            _ => throw new InvalidOperationException($"Unknown parameter type for algorithm: {algorithm}")
        };
    }

    /// <inheritdoc />
    public bool IsSupported(string algorithm) =>
        SupportedAlgorithms.ContainsKey(algorithm);

    /// <inheritdoc />
    public List<string> GetSupportedAlgorithms() =>
        SupportedAlgorithms.Keys.ToList();

    /// <summary>
    /// Generates an ML-DSA (CRYSTALS-Dilithium) key pair with the specified parameter set.
    /// </summary>
    private static AsymmetricCipherKeyPair GenerateMLDsa(MLDsaParameters parameters, SecureRandom random)
    {
        var generator = new MLDsaKeyPairGenerator();
        generator.Init(new MLDsaKeyGenerationParameters(random, parameters));
        return generator.GenerateKeyPair();
    }

    /// <summary>
    /// Generates an SLH-DSA (SPHINCS+) key pair with the specified parameter set.
    /// </summary>
    private static AsymmetricCipherKeyPair GenerateSlhDsa(SlhDsaParameters parameters, SecureRandom random)
    {
        var generator = new SlhDsaKeyPairGenerator();
        generator.Init(new SlhDsaKeyGenerationParameters(random, parameters));
        return generator.GenerateKeyPair();
    }
}
