using System.Text;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Keystore.Config;

/// <summary>
/// Provides the secondary passphrase from keystore.yaml for HKDF-based wrap key derivation
/// used when encrypting/decrypting private keys with non-RSA algorithms.
/// </summary>
public class KeystoreKeyWrappingPassphraseProvider : IKeyWrappingPassphraseProvider
{
    private readonly byte[] _passphrase;

    /// <summary>
    /// Initializes the provider by loading the secondary passphrase for the ca-certs keystore.
    /// </summary>
    /// <param name="yamlPath">Path to the keystore.yaml configuration file.</param>
    public KeystoreKeyWrappingPassphraseProvider(string yamlPath)
    {
        var passphrase = KeystoreYamlLoader.LoadSecondaryPassphrase(yamlPath, "ca-certs.keystore");
        _passphrase = Encoding.UTF8.GetBytes(passphrase);
    }

    /// <summary>
    /// Returns the secondary passphrase bytes used as IKM for HKDF key wrapping.
    /// </summary>
    public byte[] GetPassphrase() => _passphrase;
}
