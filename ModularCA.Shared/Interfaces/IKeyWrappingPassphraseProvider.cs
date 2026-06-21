namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Provides the secondary passphrase used for HKDF-based wrap key derivation
/// when encrypting/decrypting private keys with non-RSA algorithms.
/// </summary>
public interface IKeyWrappingPassphraseProvider
{
    /// <summary>
    /// Returns the secondary passphrase bytes used as IKM for HKDF key wrapping.
    /// </summary>
    byte[] GetPassphrase();
}
