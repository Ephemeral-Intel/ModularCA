namespace ModularCA.Keystore.Secure;

/// <summary>
/// Utilities for securely zeroing and disposing of sensitive byte arrays in memory.
/// </summary>
public static class SecureMemoryUtils
{
    /// <summary>
    /// Overwrites all bytes in the array with zeros.
    /// </summary>
    public static void ZeroMemory(byte[] data)
    {
        if (data == null) return;
        for (int i = 0; i < data.Length; i++)
            data[i] = 0;
    }

    /// <summary>
    /// Zeros the byte array and sets the reference to null for secure disposal.
    /// </summary>
    public static void DisposeSecure(ref byte[]? data)
    {
        if (data == null) return;
        ZeroMemory(data);
        data = null;
    }
}
