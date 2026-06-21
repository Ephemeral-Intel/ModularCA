using System.Security.Cryptography.X509Certificates;
using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Models.Config;

namespace ModularCA.API.Services;

/// <summary>
/// Shared mTLS client-certificate chain validation. Replaces the
/// ad-hoc "trust any cert whose thumbprint matches" model used by the login-path
/// mTLS controllers with a full X509Chain build against either:
/// <list type="bullet">
///   <item>the CA identified by <c>MtlsCredential.SigningCaId</c> (when the caller knows
///         which enrolled credential is being asserted), or</item>
///   <item>the system-wide trusted CA list loaded from <c>Mtls.TrustedCaCertPaths</c>
///         (fallback for early-handshake chain validation).</item>
/// </list>
/// Each call builds a fresh chain; OCSP/CRL checks honor
/// <see cref="ModularCA.Shared.Entities.SecurityPolicyEntity.RequireMtlsOcspCheck"/> — fail-closed when enabled, fail-open
/// with an audit warning when not.
/// </summary>
public static class MtlsChainValidator
{
    /// <summary>
    /// Builds a chain for <paramref name="clientCert"/> rooted at <paramref name="expectedCa"/>.
    /// Returns <c>true</c> when the chain is valid (and optionally the OCSP/CRL check
    /// passes). Writes the outcome to <paramref name="chainErrors"/> for audit.
    /// </summary>
    public static bool ValidateAgainstCa(
        X509Certificate2 clientCert,
        X509Certificate2 expectedCa,
        bool requireRevocationCheck,
        out string? chainErrors)
    {
        chainErrors = null;
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(expectedCa);
        chain.ChainPolicy.RevocationMode = requireRevocationCheck
            ? X509RevocationMode.Online
            : X509RevocationMode.NoCheck;
        chain.ChainPolicy.RevocationFlag = X509RevocationFlag.ExcludeRoot;
        chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;

        bool ok = chain.Build(clientCert);
        if (!ok)
        {
            chainErrors = string.Join("; ", chain.ChainStatus.Select(s => $"{s.Status}:{s.StatusInformation?.Trim()}"));
            return false;
        }
        return true;
    }

    /// <summary>
    /// Loads the signing CA's <see cref="X509Certificate2"/> from the DB for the given
    /// mTLS credential, then validates <paramref name="clientCert"/>'s chain against it.
    /// Returns <c>true</c> on success.
    /// </summary>
    public static async Task<bool> ValidateAgainstCredentialCaAsync(
        ModularCADbContext db,
        Guid signingCaId,
        X509Certificate2 clientCert,
        bool requireRevocationCheck,
        CancellationToken ct = default)
    {
        var caCertEntity = await db.CertificateAuthorities
            .AsNoTracking()
            .Where(c => c.Id == signingCaId)
            .Select(c => new { c.CertificateId })
            .FirstOrDefaultAsync(ct);

        if (caCertEntity?.CertificateId == null) return false;

        var caCertRow = await db.Certificates
            .AsNoTracking()
            .Where(c => c.CertificateId == caCertEntity.CertificateId)
            .Select(c => new { c.RawCertificate })
            .FirstOrDefaultAsync(ct);

        if (caCertRow?.RawCertificate == null) return false;

        using var caCert = X509CertificateLoader.LoadCertificate(caCertRow.RawCertificate);
        return ValidateAgainstCa(clientCert, caCert, requireRevocationCheck, out _);
    }
}
