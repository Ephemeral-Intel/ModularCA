using ModularCA.Shared.Interfaces;

namespace ModularCA.Keystore.Config;

/// <summary>
/// No-op passphrase provider used during setup mode when keystore files don't exist yet.
/// Throws if actually called, since key wrapping should not occur during setup.
/// </summary>
public class SetupModeKeyWrappingPassphraseProvider : IKeyWrappingPassphraseProvider
{
    /// <summary>
    /// Throws because key wrapping is not available during setup mode.
    /// </summary>
    public byte[] GetPassphrase()
    {
        throw new InvalidOperationException(
            "Key wrapping passphrase is not available during setup mode. " +
            "Complete bootstrap before performing key wrapping operations.");
    }
}
