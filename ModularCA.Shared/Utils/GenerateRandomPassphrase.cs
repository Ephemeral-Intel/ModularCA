using System.Security.Cryptography;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Generates cryptographically secure random passphrases.
    /// </summary>
    public class GenerateRandomPassphrase
    {
        /// <summary>
        /// Generates a random alphanumeric passphrase of the specified length using a CSPRNG
        /// with uniform distribution (no modulo bias).
        /// </summary>
        public static string Generate(int length = 24)
        {
            const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var result = new char[length];
            for (int i = 0; i < length; i++)
                result[i] = chars[RandomNumberGenerator.GetInt32(chars.Length)];
            return new string(result);
        }
    }
}
