using ModularCA.Keystore.KeystoreFormat;
using Org.BouncyCastle.Crypto.Generators;
using System.Text;

namespace ModularCA.Keystore.Crypto;

/// <summary>
/// Derives encryption keys from passphrases using the scrypt key derivation function.
/// <para>
/// The passphrase inputs are combined via a length-prefixed UTF-8 encoding
/// (<c>uint32_be(len(main)) || main || uint32_be(len(secondary)) || secondary</c>) on new
/// (MCAKSTR v3) keystores rather than raw string concatenation so that
/// <c>"fo" + "obar" != "foo" + "bar"</c> at the scrypt input. Legacy v2 files stay on the
/// raw <c>mainPass + secondaryPass</c> encoding so existing installs keep decrypting
/// without a breaking change. The format version is read from
/// <see cref="KeystoreFile.FormatVersion"/> by <see cref="DeriveFileKey"/>.
/// </para>
/// <para>
/// Domain separation between the keystore-encryption key and per-entry keys (HKDF over the
/// scrypt output with a per-entry label) remains deferred to the next format-version bump.
/// </para>
/// </summary>
public static class ScryptKeyDeriver
{
    /// <summary>
    /// Derives a 256-bit key from main and secondary passphrases using specified scrypt
    /// parameters. Always uses the current (v3) length-prefixed encoding. Callers that need
    /// to decrypt a legacy v2 keystore should go through <see cref="DeriveFileKey"/> which
    /// honors <see cref="KeystoreFile.FormatVersion"/>.
    /// </summary>
    public static byte[] DeriveKey(string mainPass, string secondaryPass, int N, int r, int p, byte[] salt)
    {
        var combined = BuildScryptInput(mainPass, secondaryPass, formatVersion: 3);
        return SCrypt.Generate(combined, salt, N, r, p, 32);
    }

    /// <summary>
    /// Derives a file encryption key using passphrases and scrypt parameters from a keystore
    /// file. The scrypt input encoding depends on <see cref="KeystoreFile.FormatVersion"/>:
    /// v2 uses the legacy raw <c>main + secondary</c> concat; v3+ uses the length-prefixed
    /// UTF-8 encoding described in the class remarks.
    /// </summary>
    public static byte[] DeriveFileKey(string mainPass, string secondaryPass, KeystoreFile file)
    {
        var combined = BuildScryptInput(mainPass, secondaryPass, file.FormatVersion);
        try
        {
            var salt = Convert.FromBase64String(file.ScryptSalt);
            return SCrypt.Generate(combined, salt, file.ScryptN, file.ScryptR, file.ScryptP, 32);
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(combined);
        }
    }

    /// <summary>
    /// Byte-array overload that accepts the main passphrase as raw UTF-8
    /// bytes. Lets callers hold the secret in an erasable <c>byte[]</c> instead of an
    /// immutable .NET string that can't be zeroed. The secondary passphrase stays as
    /// a string for now (it comes from yaml/env-var, which are managed strings at the
    /// source) — migrating that is tracked separately.
    /// </summary>
    public static byte[] DeriveFileKey(byte[] mainPassUtf8, string secondaryPass, KeystoreFile file)
    {
        var combined = BuildScryptInput(mainPassUtf8, secondaryPass, file.FormatVersion);
        try
        {
            var salt = Convert.FromBase64String(file.ScryptSalt);
            return SCrypt.Generate(combined, salt, file.ScryptN, file.ScryptR, file.ScryptP, 32);
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(combined);
        }
    }

    /// <summary>
    /// Byte-array variant of <see cref="BuildScryptInput(string, string, int)"/> that avoids
    /// materializing the main passphrase as a managed string.
    /// </summary>
    private static byte[] BuildScryptInput(byte[] mainBytes, string secondaryPass, int formatVersion)
    {
        mainBytes ??= Array.Empty<byte>();
        secondaryPass ??= string.Empty;

        if (formatVersion <= 2)
        {
            var secBytes = Encoding.UTF8.GetBytes(secondaryPass);
            var legacy = new byte[mainBytes.Length + secBytes.Length];
            Buffer.BlockCopy(mainBytes, 0, legacy, 0, mainBytes.Length);
            Buffer.BlockCopy(secBytes, 0, legacy, mainBytes.Length, secBytes.Length);
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(secBytes);
            return legacy;
        }

        var sec = Encoding.UTF8.GetBytes(secondaryPass);
        try
        {
            var output = new byte[4 + mainBytes.Length + 4 + sec.Length];
            var span = output.AsSpan();
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(span.Slice(0, 4), (uint)mainBytes.Length);
            mainBytes.CopyTo(span.Slice(4));
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(span.Slice(4 + mainBytes.Length, 4), (uint)sec.Length);
            sec.CopyTo(span.Slice(4 + mainBytes.Length + 4));
            return output;
        }
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(sec);
        }
    }

    /// <summary>
    /// Encodes (main, secondary) either as the legacy raw string concatenation
    /// (format version 2) or as
    /// <c>uint32_be(len(main)) || utf8(main) || uint32_be(len(secondary)) || utf8(secondary)</c>
    /// (format version 3). The v3 length prefixes eliminate the
    /// <c>"fo"+"obar" == "foo"+"bar"</c> ambiguity of raw concatenation.
    /// </summary>
    private static byte[] BuildScryptInput(string mainPass, string secondaryPass, int formatVersion)
    {
        mainPass ??= string.Empty;
        secondaryPass ??= string.Empty;

        if (formatVersion <= 2)
        {
            // Legacy v2 encoding: raw string concatenation. Kept for backwards compatibility
            // with existing installs — new writes always produce v3 files.
            return Encoding.UTF8.GetBytes(mainPass + secondaryPass);
        }

        // v3+ length-prefixed encoding.
        var mainBytes = Encoding.UTF8.GetBytes(mainPass);
        var secBytes = Encoding.UTF8.GetBytes(secondaryPass);

        var output = new byte[4 + mainBytes.Length + 4 + secBytes.Length];
        var span = output.AsSpan();
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(span.Slice(0, 4), (uint)mainBytes.Length);
        mainBytes.CopyTo(span.Slice(4));
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(span.Slice(4 + mainBytes.Length, 4), (uint)secBytes.Length);
        secBytes.CopyTo(span.Slice(4 + mainBytes.Length + 4));
        return output;
    }
}
