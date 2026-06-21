using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using System.Security.Cryptography;

namespace ModularCA.Auth.Utils
{
    /// <summary>
    /// Password generation, hashing, and verification utilities.
    /// <para>
    /// Hashes now carry an algorithm prefix so the verifier can detect
    /// legacy PBKDF2-HMAC-SHA512 @ 100k hashes and transparently rehash them on successful
    /// login. New hashes default to <c>pbkdf2-sha512-v1</c> at 600,000 iterations (well
    /// above OWASP 2023's 210k floor). A future migration to Argon2id can add an
    /// <c>argon2id-v1</c> prefix without touching call sites — verifier fallbacks detect
    /// the legacy unprefixed format.
    /// </para>
    /// </summary>
    public class PasswordUtil
    {
        private const string Lower = "abcdefghjkmnpqrstuvwxyz"; // no 'i', 'l'
        private const string Upper = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no 'I', 'O'
        private const string Digits = "23456789"; // no '0', '1'
        private const string Symbols = "!@#$%^&*()-_=+";

        private const int SaltSize = 16; // 128 bits
        private const int HashSize = 32; // 256 bits

        /// <summary>
        /// Current default iteration count for PBKDF2-HMAC-SHA512. Raised from 100k
        /// to 600k — OWASP 2023 floor for SHA-512 is 210k; we exceed
        /// it comfortably to buy headroom against GPU/ASIC cracking.
        /// </summary>
        public const int CurrentPbkdf2Iterations = 600_000;

        /// <summary>
        /// Minimum iteration count a stored PBKDF2 hash must have to be considered
        /// "current". Values below this trigger a transparent rehash on successful login.
        /// </summary>
        public const int MinAcceptablePbkdf2Iterations = 210_000;

        private const string Pbkdf2Prefix = "pbkdf2-sha512-v1";

        /// <summary>
        /// Pre-computed sentinel hash used by the login path to perform a dummy verify
        /// when the user lookup fails, so the wall-clock timing matches the known-user
        /// path. Seeded lazily via <see cref="GetDummyVerificationTarget"/> and never
        /// matches any real password.
        /// </summary>
        private static readonly Lazy<string> _dummySentinelHash = new(() =>
        {
            // Use a cryptographically random 32-byte input hashed with the current
            // parameters. The resulting hash cannot be matched by any user-supplied
            // password (256-bit min-entropy input), so the VerifyPassword path always
            // returns false but runs the full PBKDF2 work.
            var rand = RandomNumberGenerator.GetBytes(32);
            return HashPassword(Convert.ToBase64String(rand));
        });

        /// <summary>
        /// Generates a memorable but strong random password of the given length.
        /// </summary>
        public static string Generate(int length = 16, bool includeSymbols = true)
        {
            if (length < 8) throw new ArgumentException("Password length must be at least 8");

            var charSets = new[]
            {
                Lower.ToCharArray(),
                Upper.ToCharArray(),
                Digits.ToCharArray(),
                includeSymbols ? Symbols.ToCharArray() : Array.Empty<char>()
            }.Where(set => set.Length > 0).ToList();

            var allChars = charSets.SelectMany(c => c).ToArray();
            if (allChars.Length == 0) throw new InvalidOperationException("No character sets selected.");

            var password = new char[length];
            using var rng = RandomNumberGenerator.Create();

            // Ensure one from each required set
            for (int i = 0; i < charSets.Count; i++)
            {
                password[i] = GetRandomChar(rng, charSets[i]);
            }

            // Fill the rest with random chars
            for (int i = charSets.Count; i < length; i++)
            {
                password[i] = GetRandomChar(rng, allChars);
            }

            // Fisher-Yates shuffle to avoid predictable positions
            for (int i = password.Length - 1; i > 0; i--)
            {
                int j = RandomNumberGenerator.GetInt32(i + 1);
                (password[i], password[j]) = (password[j], password[i]);
            }
            return new string(password);
        }

        private static char GetRandomChar(RandomNumberGenerator rng, char[] set)
        {
            return set[RandomNumberGenerator.GetInt32(set.Length)];
        }

        /// <summary>
        /// Hashes a password with the current algorithm and parameters. Returns a
        /// self-describing string of the form <c>pbkdf2-sha512-v1$iterations$salt$hash</c>.
        /// </summary>
        public static string HashPassword(string password)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);

            byte[] hash = KeyDerivation.Pbkdf2(
                password: password,
                salt: salt,
                prf: KeyDerivationPrf.HMACSHA512,
                iterationCount: CurrentPbkdf2Iterations,
                numBytesRequested: HashSize
            );

            return $"{Pbkdf2Prefix}${CurrentPbkdf2Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
        }

        /// <summary>
        /// Verifies a password against a stored hash. Handles both the modern
        /// algorithm-prefixed format (<c>pbkdf2-sha512-v1$iter$salt$hash</c>) and the
        /// legacy format (<c>iter.salt.hash</c>). Uses
        /// <see cref="CryptographicOperations.FixedTimeEquals"/> to compare digests.
        /// </summary>
        public static bool VerifyPassword(string password, string storedHash)
        {
            if (string.IsNullOrEmpty(storedHash))
                return false;

            try
            {
                // Modern prefixed format: pbkdf2-sha512-v1$iter$salt$hash
                if (storedHash.StartsWith(Pbkdf2Prefix + "$", StringComparison.Ordinal))
                {
                    var parts = storedHash.Split('$');
                    if (parts.Length != 4) return false;

                    if (!int.TryParse(parts[1], out var iterations) || iterations <= 0)
                        return false;
                    byte[] salt = Convert.FromBase64String(parts[2]);
                    byte[] expectedHash = Convert.FromBase64String(parts[3]);

                    byte[] actualHash = KeyDerivation.Pbkdf2(
                        password: password,
                        salt: salt,
                        prf: KeyDerivationPrf.HMACSHA512,
                        iterationCount: iterations,
                        numBytesRequested: expectedHash.Length);

                    return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
                }

                // Legacy unprefixed format: iter.salt.hash
                if (storedHash.Contains('.'))
                {
                    var parts = storedHash.Split('.');
                    if (parts.Length != 3) return false;
                    if (!int.TryParse(parts[0], out var iterations) || iterations <= 0)
                        return false;
                    byte[] salt = Convert.FromBase64String(parts[1]);
                    byte[] expectedHash = Convert.FromBase64String(parts[2]);

                    byte[] actualHash = KeyDerivation.Pbkdf2(
                        password: password,
                        salt: salt,
                        prf: KeyDerivationPrf.HMACSHA512,
                        iterationCount: iterations,
                        numBytesRequested: expectedHash.Length);

                    return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
                }

                return false;
            }
            catch (FormatException)
            {
                return false;
            }
            catch (ArgumentException)
            {
                return false;
            }
        }

        /// <summary>
        /// Returns <c>true</c> if the given stored hash is using a legacy format or
        /// below the current minimum iteration count and should be rehashed on the
        /// next successful verification.
        /// </summary>
        public static bool NeedsRehash(string storedHash)
        {
            if (string.IsNullOrEmpty(storedHash))
                return false;

            try
            {
                // Legacy unprefixed format — always rehash
                if (!storedHash.StartsWith(Pbkdf2Prefix + "$", StringComparison.Ordinal))
                    return true;

                var parts = storedHash.Split('$');
                if (parts.Length != 4) return true;
                if (!int.TryParse(parts[1], out var iterations)) return true;
                return iterations < MinAcceptablePbkdf2Iterations;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Performs a constant-time dummy verify so the "user not found"
        /// branch of the login path takes roughly the same wall-clock time as the known-user
        /// branch. The sentinel hash is computed lazily once per process from random bytes.
        /// Always returns <c>false</c>.
        /// </summary>
        public static bool DummyVerify(string submittedPassword)
        {
            // We pass a guaranteed-wrong password so there's no risk of coincidental match.
            return VerifyPassword(submittedPassword ?? string.Empty, _dummySentinelHash.Value);
        }
    }
}
