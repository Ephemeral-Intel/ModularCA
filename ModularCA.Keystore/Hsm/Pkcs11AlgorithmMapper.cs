using Net.Pkcs11Interop.Common;

namespace ModularCA.Keystore.Hsm;

/// <summary>
/// Maps BouncyCastle algorithm names to PKCS#11 CKM mechanism constants
/// used for signing and key generation operations on an HSM.
/// </summary>
public static class Pkcs11AlgorithmMapper
{
    private static readonly Dictionary<string, CKM> SignMechanisms = new(StringComparer.OrdinalIgnoreCase)
    {
        // PKCS#1 v1.5 RSA padding
        ["SHA256withRSA"]   = CKM.CKM_SHA256_RSA_PKCS,
        ["SHA384withRSA"]   = CKM.CKM_SHA384_RSA_PKCS,
        ["SHA512withRSA"]   = CKM.CKM_SHA512_RSA_PKCS,
        // RSA-PSS padding (NIST SP 800-131A Rev 2 recommended)
        ["SHA256withRSAandMGF1"] = CKM.CKM_SHA256_RSA_PKCS_PSS,
        ["SHA384withRSAandMGF1"] = CKM.CKM_SHA384_RSA_PKCS_PSS,
        ["SHA512withRSAandMGF1"] = CKM.CKM_SHA512_RSA_PKCS_PSS,
        // ECDSA
        ["SHA256withECDSA"] = CKM.CKM_ECDSA_SHA256,
        ["SHA384withECDSA"] = CKM.CKM_ECDSA_SHA384,
        ["SHA512withECDSA"] = CKM.CKM_ECDSA_SHA512,
        ["Ed25519"]         = (CKM)0x00001057, // CKM_EDDSA (PKCS#11 v3.0)
        ["Ed448"]           = (CKM)0x00001057, // CKM_EDDSA (PKCS#11 v3.0)
    };

    private static readonly Dictionary<string, CKM> KeyGenMechanisms = new(StringComparer.OrdinalIgnoreCase)
    {
        ["RSA"] = CKM.CKM_RSA_PKCS_KEY_PAIR_GEN,
        ["EC"]  = CKM.CKM_EC_KEY_PAIR_GEN,
    };

    /// <summary>
    /// Returns the PKCS#11 signing mechanism corresponding to a BouncyCastle algorithm name.
    /// </summary>
    /// <param name="bcAlgorithmName">
    /// BouncyCastle-style algorithm identifier (e.g. "SHA256withRSA", "SHA384withECDSA", "Ed25519").
    /// </param>
    /// <returns>The matching <see cref="CKM"/> constant.</returns>
    /// <exception cref="NotSupportedException">Thrown when the algorithm name is not recognised.</exception>
    public static CKM GetSignMechanism(string bcAlgorithmName)
    {
        if (SignMechanisms.TryGetValue(bcAlgorithmName, out var mechanism))
            return mechanism;

        throw new NotSupportedException(
            $"Unsupported signing algorithm '{bcAlgorithmName}'. " +
            $"Supported: {string.Join(", ", SignMechanisms.Keys)}");
    }

    /// <summary>
    /// Returns the PKCS#11 key-pair generation mechanism for the given key algorithm family.
    /// </summary>
    /// <param name="keyAlgorithm">Key algorithm family, e.g. "RSA" or "EC".</param>
    /// <returns>The matching <see cref="CKM"/> key generation constant.</returns>
    /// <exception cref="NotSupportedException">Thrown when the key algorithm is not recognised.</exception>
    public static CKM GetKeyGenMechanism(string keyAlgorithm)
    {
        if (KeyGenMechanisms.TryGetValue(keyAlgorithm, out var mechanism))
            return mechanism;

        throw new NotSupportedException(
            $"Unsupported key algorithm '{keyAlgorithm}'. " +
            $"Supported: {string.Join(", ", KeyGenMechanisms.Keys)}");
    }
}
