using ModularCA.Shared.Entities;
using ModularCA.Shared.Models;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages CA service URL configuration (the public base URL) used to generate CDP, OCSP, and
/// AIA endpoints embedded in issued certificates. The actual URLs are not stored — they're
/// computed on demand by appending the standard short-URL paths to the base URL.
/// </summary>
public interface ICaServiceUrlService
{
    /// <summary>
    /// Gets the raw service URL row for a specific CA certificate. Consumers that want the
    /// computed CDP/OCSP/AIA URLs ready to embed in a new cert should call
    /// <see cref="ResolveForCaAsync"/> instead.
    /// </summary>
    Task<CaServiceUrlEntity?> GetByCaCertificateIdAsync(Guid caCertificateId);

    /// <summary>
    /// Returns all CA service URL configurations.
    /// </summary>
    Task<List<CaServiceUrlEntity>> GetAllAsync();

    /// <summary>
    /// Creates or updates the public base URL for a CA. Trailing slashes are stripped. Passing
    /// null or empty clears the base URL — the CA will issue certs without CDP/AIA extensions
    /// until a base URL is set again.
    /// </summary>
    Task<CaServiceUrlEntity> CreateOrUpdateAsync(Guid caCertificateId, string? publicBaseUrl);

    /// <summary>
    /// Computes the CDP, OCSP, and CA-Issuer URLs for certificates issued under
    /// <paramref name="caCertificateId"/> by combining the CA's stored <c>PublicBaseUrl</c>
    /// with the standard short-URL paths:
    /// <list type="bullet">
    ///   <item><description><c>{base}/crl/{label}</c> (or <c>{serial}</c> if the label is missing)</description></item>
    ///   <item><description><c>{base}/ocsp</c></description></item>
    ///   <item><description><c>{base}/ca/{label}</c> (or <c>{serial}</c> if the label is missing)</description></item>
    /// </list>
    /// Returns empty lists if the CA has no service URL row OR the base URL is unset — in that
    /// case the certificate builder skips the CDP and AIA extensions entirely.
    /// </summary>
    Task<ResolvedCaServiceUrls> ResolveForCaAsync(Guid caCertificateId);

    /// <summary>
    /// Deletes the service URL configuration for a CA certificate.
    /// </summary>
    Task<bool> DeleteAsync(Guid caCertificateId);
}
