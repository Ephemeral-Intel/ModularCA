namespace ModularCA.Shared.Interfaces
{
    /// <summary>
    /// Abstraction for private key operations so callers don't need raw key bytes.
    /// Enables HSM-backed (PKCS#11) keys alongside software keys.
    /// </summary>
    public interface IPrivateKeyHandle
    {
        bool CanExport { get; }
        byte[]? ExportPrivateKeyDer(); // only for software keys
        byte[] Sign(byte[] data, string algorithm);
    }
}