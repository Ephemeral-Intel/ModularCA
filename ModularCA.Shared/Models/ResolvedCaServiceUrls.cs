namespace ModularCA.Shared.Models;

/// <summary>
/// Output of <see cref="ModularCA.Shared.Interfaces.ICaServiceUrlService.ResolveForCaAsync"/> —
/// the fully-resolved CDP, OCSP, and CA-Issuer URL lists that the certificate builder should
/// embed in the CDP and AIA extensions of every certificate issued under a given CA. Custom
/// entries stored on the <c>CaServiceUrlEntity</c> are merged with the CA's <c>PublicBaseUrl</c>
/// so relative paths are prefixed and empty fields fall back to the standard short-URL patterns
/// (<c>{base}/crl/{label}</c>, <c>{base}/ocsp</c>, <c>{base}/ca/{label}</c>).
/// </summary>
/// <param name="CdpUrls">Fully-resolved CRL Distribution Point URLs.</param>
/// <param name="OcspUrls">Fully-resolved OCSP responder URLs.</param>
/// <param name="CaIssuerUrls">Fully-resolved CA Issuer URLs for the AIA extension.</param>
public sealed record ResolvedCaServiceUrls(
    List<string> CdpUrls,
    List<string> OcspUrls,
    List<string> CaIssuerUrls);
