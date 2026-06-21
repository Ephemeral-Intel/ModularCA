using Microsoft.EntityFrameworkCore;
using ModularCA.Core.Models;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Utils;
using Org.BouncyCastle.Asn1.X509;
using System.Text.Json;

namespace ModularCA.Core.Services
{
    /// <summary>
    /// Validates certificate issuance parameters against certificate profiles and signing profiles.
    /// Handles soft constraints (cert profile) and hard constraints (signing profile), as well as
    /// OID resolution and key-usage parsing.
    /// </summary>
    public class IssuanceValidationService
    {
        private readonly ModularCADbContext _db;

        /// <summary>
        /// Initializes a new instance of <see cref="IssuanceValidationService"/>.
        /// </summary>
        /// <param name="db">Database context used for OID option lookups.</param>
        public IssuanceValidationService(ModularCADbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// Validates the key algorithm, key size, and signature algorithm against the soft constraints
        /// defined in the effective certificate profile (AllowedKeyAlgorithms, AllowedKeySizes, AllowedSignatureAlgorithms).
        /// Throws if any constraint is violated.
        /// </summary>
        /// <param name="algorithm">The key algorithm from the CSR (e.g. RSA, ECDSA).</param>
        /// <param name="keySize">The key size or curve name from the CSR.</param>
        /// <param name="signatureAlgorithm">The signature algorithm from the CSR.</param>
        /// <param name="certProfile">The resolved effective certificate profile containing allowed values.</param>
        public void ValidateAgainstCertProfile(string algorithm, string keySize, string signatureAlgorithm, EffectiveCertProfile certProfile)
        {
            var validAlgorithms = JsonSerializer.Deserialize<List<string>>(certProfile.AllowedKeyAlgorithms ?? "[]", SafeJsonOptions.Default);
            var validKeySizes = JsonSerializer.Deserialize<List<string>>(certProfile.AllowedKeySizes ?? "[]", SafeJsonOptions.Default);
            var validSigAlgs = JsonSerializer.Deserialize<List<string>>(certProfile.AllowedSignatureAlgorithms ?? "[]", SafeJsonOptions.Default);

            if (validAlgorithms?.Count > 0 && !validAlgorithms.Contains(algorithm, StringComparer.OrdinalIgnoreCase))
                throw new Exception($"Key algorithm \"{algorithm}\" not allowed by certificate profile.");
            if (!IsKeySizeIgnored(algorithm) && validKeySizes?.Count > 0 && !validKeySizes.Contains(keySize))
                throw new Exception($"Key size \"{keySize}\" not allowed by certificate profile.");
            if (validSigAlgs?.Count > 0 && !validSigAlgs.Contains(signatureAlgorithm, StringComparer.OrdinalIgnoreCase))
                throw new Exception($"Signature algorithm \"{signatureAlgorithm}\" not allowed by certificate profile.");
        }

        /// <summary>
        /// Validates the key algorithm against the hard constraints defined in the signing profile
        /// (AllowedAlgorithms) and verifies signature algorithm compatibility.
        /// Throws if any constraint is violated.
        /// </summary>
        /// <param name="algorithm">The key algorithm from the CSR.</param>
        /// <param name="signatureAlgorithm">The signature algorithm from the CSR.</param>
        /// <param name="signingProfile">The signing profile containing hard constraints.</param>
        public void ValidateAgainstSigningProfile(string algorithm, string signatureAlgorithm, SigningProfileEntity signingProfile)
        {
            var allowedAlgorithms = JsonSerializer.Deserialize<List<string>>(signingProfile.AllowedAlgorithms ?? "[]", SafeJsonOptions.Default);
            if (allowedAlgorithms?.Count > 0 && !allowedAlgorithms.Contains(algorithm, StringComparer.OrdinalIgnoreCase))
                throw new Exception($"Key algorithm \"{algorithm}\" not allowed by signing profile \"{signingProfile.Name}\".");

            if (!IsSignatureAlgorithmCompatible(algorithm, signatureAlgorithm))
                throw new Exception($"Signature algorithm \"{signatureAlgorithm}\" not compatible with key algorithm \"{algorithm}\".");
        }

        /// <summary>
        /// Checks that the requested NotAfter date does not exceed the maximum validity period
        /// defined by the effective certificate profile. A null <paramref name="notAfter"/> is
        /// treated as "use the profile default" and is always considered within bounds — the
        /// issuance pipeline substitutes <c>now + ValidityPeriodMax</c> in that case, which is
        /// by construction ≤ <c>maxDate</c>.
        /// </summary>
        /// <param name="notAfter">The requested NotAfter date, or null to use the profile default.</param>
        /// <param name="certProfile">The resolved effective certificate profile with validity constraints.</param>
        /// <returns><c>true</c> if the date is within the allowed range or null; otherwise <c>false</c>.</returns>
        public bool NotBeyondMaximumDate(DateTime? notAfter, EffectiveCertProfile certProfile)
        {
            // A null notAfter used to silently return false because
            // `null <= maxDate` evaluates to false in C#'s nullable relational
            // semantics. Any caller that relied on "defaults to profile max" (ACME,
            // several API routes) received a spurious rejection. Null now short-
            // circuits to true.
            if (notAfter == null)
                return true;
            var maxDate = DateTime.UtcNow.Add(Iso8601ParserUtil.ParseIso8601(certProfile.ValidityPeriodMax ?? "P1Y"));
            return notAfter <= maxDate;
        }

        /// <summary>
        /// Checks that the requested certificate validity duration (<c>notAfter - notBefore</c>)
        /// meets the effective certificate profile's minimum validity period. When either date
        /// is null, the defaults used by the issuance pipeline are substituted: <c>notBefore</c>
        /// defaults to <see cref="DateTime.UtcNow"/>, and <c>notAfter</c> defaults to
        /// <c>notBefore + ValidityPeriodMax</c>. The default for <c>ValidityPeriodMin</c> is
        /// <c>P0D</c> (no floor) so profiles that don't explicitly set a minimum never reject
        /// issuance on duration alone.
        /// </summary>
        /// <param name="notBefore">The requested NotBefore date (may be null — defaults to now).</param>
        /// <param name="notAfter">The requested NotAfter date (may be null — defaults to notBefore + ValidityPeriodMax).</param>
        /// <param name="certProfile">The resolved effective certificate profile with validity constraints.</param>
        /// <returns><c>true</c> if the resulting duration is &gt;= the profile's minimum; otherwise <c>false</c>.</returns>
        public bool ValidityDurationMeetsMinimum(DateTime? notBefore, DateTime? notAfter, EffectiveCertProfile certProfile)
        {
            var from = notBefore ?? DateTime.UtcNow;
            var to = notAfter
                ?? from.Add(Iso8601ParserUtil.ParseIso8601(certProfile.ValidityPeriodMax ?? "P1Y"));
            var duration = to - from;
            var minDuration = Iso8601ParserUtil.ParseIso8601(certProfile.ValidityPeriodMin ?? "P0D");
            return duration >= minDuration;
        }

        /// <summary>
        /// Returns <c>true</c> when the key algorithm uses a fixed key size that should not be validated
        /// (e.g. Ed25519, ML-DSA, SLH-DSA).
        /// </summary>
        /// <param name="algorithm">The key algorithm name.</param>
        /// <returns><c>true</c> if key size validation should be skipped.</returns>
        public bool IsKeySizeIgnored(string algorithm) =>
            algorithm.ToUpperInvariant() switch
            {
                "ED25519" or "ED448" => true,
                "ML-DSA" or "ML-DSA-44" or "ML-DSA-65" or "ML-DSA-87" or "DILITHIUM" => true,
                "SLH-DSA" or "SPHINCSPLUS" => true,
                var a when a.StartsWith("SLH-DSA-") => true,
                _ => false
            };

        /// <summary>
        /// Checks whether the given signature algorithm is compatible with the key algorithm.
        /// </summary>
        /// <param name="algorithm">The key algorithm (e.g. RSA, ECDSA, Ed25519).</param>
        /// <param name="signatureAlgorithm">The signature algorithm from the CSR.</param>
        /// <returns><c>true</c> if compatible.</returns>
        public bool IsSignatureAlgorithmCompatible(string algorithm, string signatureAlgorithm) =>
            algorithm.ToUpperInvariant() switch
            {
                "RSA" or "ECDSA" => signatureAlgorithm.Contains(algorithm, StringComparison.OrdinalIgnoreCase),
                _ => signatureAlgorithm.Equals(algorithm, StringComparison.OrdinalIgnoreCase)
            };

        /// <summary>
        /// Checks whether the key algorithm and size/curve combination is valid.
        /// </summary>
        /// <param name="algorithm">The key algorithm.</param>
        /// <param name="keySizeOrCurve">The key size (for RSA) or curve name (for ECDSA).</param>
        /// <returns><c>true</c> if the combination is valid.</returns>
        public bool IsKeyAlgorithmAndSizeCompatible(string algorithm, string keySizeOrCurve)
        {
            switch (algorithm.ToUpperInvariant())
            {
                case "RSA":
                    return keySizeOrCurve is "2048" or "3072" or "4096" or "7680" or "8192";
                case "ECDSA":
                    var validCurves = new[] { "P-256", "P-384", "P-521", "secp256r1", "secp384r1", "secp521r1" };
                    return validCurves.Contains(keySizeOrCurve, StringComparer.OrdinalIgnoreCase);
                case "ED25519":
                case "ED448":
                case "ML-DSA" or "ML-DSA-44" or "ML-DSA-65" or "ML-DSA-87" or "DILITHIUM":
                case "SLH-DSA" or "SPHINCSPLUS":
                case var a when a.StartsWith("SLH-DSA-"):
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>
        /// Resolves the effective extended key usages by intersecting the cert profile EKUs
        /// with the signing profile's hard-constraint AllowedEKUs, then filtering against
        /// the OID options table.
        /// </summary>
        /// <param name="certProfileEkus">JSON array of EKU OIDs from the certificate profile.</param>
        /// <param name="signingProfileAllowedEkus">JSON array of allowed EKU OIDs from the signing profile.</param>
        /// <returns>List of validated EKU OID strings.</returns>
        public List<string> SetupAllowedExtendedOids(string certProfileEkus, string signingProfileAllowedEkus)
        {
            var certEkus = JsonSerializer.Deserialize<List<string>>(certProfileEkus ?? "[]", SafeJsonOptions.Default) ?? new List<string>();
            if (certEkus.Count == 0)
                return new List<string>();

            // anyExtendedKeyUsage (OID 2.5.29.37.0) MUST NOT appear in
            // publicly-trusted subscriber certificates per RFC 5280 §4.2.1.12 and
            // CA/B Forum BR §7.1.2.2. Reject it unconditionally regardless of what
            // the profile or OIDOptions table says — a mis-configured profile
            // otherwise mints certs that silently bypass every downstream EKU check.
            const string AnyExtendedKeyUsageOid = "2.5.29.37.0";
            if (certEkus.Any(e => string.Equals(e, AnyExtendedKeyUsageOid, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException(
                    "Certificate profile contains anyExtendedKeyUsage (OID 2.5.29.37.0), which is forbidden. " +
                    "Remove it from the profile's ExtendedKeyUsages list.");
            }

            var sigEkus = JsonSerializer.Deserialize<List<string>>(signingProfileAllowedEkus ?? "[]", SafeJsonOptions.Default) ?? new List<string>();
            if (sigEkus.Any(e => string.Equals(e, AnyExtendedKeyUsageOid, StringComparison.Ordinal)))
            {
                throw new InvalidOperationException(
                    "Signing profile AllowedEKUs contains anyExtendedKeyUsage (OID 2.5.29.37.0), which is forbidden.");
            }

            IEnumerable<string> effective = certEkus;
            if (sigEkus.Count > 0)
            {
                var sigSet = new HashSet<string>(sigEkus, StringComparer.OrdinalIgnoreCase);
                effective = certEkus.Where(e => sigSet.Contains(e));
            }

            var oidSet = new HashSet<string>(effective);
            var allowedExtended = _db.OIDOptions
                .Where(o => o.KeyUsage == "Extended")
                .Select(o => o.OID)
                .ToList()
                .Where(oid => oidSet.Contains(oid) && oid != AnyExtendedKeyUsageOid)
                .ToList();
            return allowedExtended;
        }

        /// <summary>
        /// Resolves the allowed standard (non-extended) key usages from the certificate profile's
        /// KeyUsages field, filtering against the OID options table.
        /// </summary>
        /// <param name="allowedStandardOids">JSON array of standard key usage friendly names from the certificate profile.</param>
        /// <returns>List of validated standard key usage friendly names.</returns>
        public List<string> SetupAllowedStandardOids(string allowedStandardOids)
        {
            var standardOidsDeserialize = JsonSerializer.Deserialize<List<string>>(allowedStandardOids, SafeJsonOptions.Default);
            if (standardOidsDeserialize == null)
                return new List<string>();
            var oidSet = new HashSet<string>(standardOidsDeserialize);
            var allowedStandard = _db.OIDOptions
                .Where(o => o.KeyUsage == "Standard")
                .Select(o => o.FriendlyName)
                .ToList()
                .Where(name => oidSet.Contains(name))
                .ToList();
            return allowedStandard;
        }

        /// <summary>
        /// Converts a key usage friendly name to the corresponding BouncyCastle <see cref="KeyUsage"/> bit flag.
        /// Delegates to the shared <see cref="KeyUsageFriendlyNames.Parse(string)"/> helper so the
        /// friendly-name map lives in exactly one place. Fails closed on unknown names.
        /// </summary>
        /// <param name="name">The key usage friendly name (e.g. "Digital Signature", "Key Encipherment").</param>
        /// <returns>The integer bit flag.</returns>
        /// <exception cref="InvalidOperationException">Thrown when <paramref name="name"/> is unrecognized.</exception>
        public int ParseKeyUsage(string name) => KeyUsageFriendlyNames.Parse(name);
    }
}
