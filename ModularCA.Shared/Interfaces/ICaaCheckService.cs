namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Checks CAA (Certification Authority Authorization) DNS records before ACME certificate
/// issuance, per RFC 8659 and RFC 8555 section 7.4.2. If CAA records exist for a domain
/// but do not authorize this CA, issuance should be rejected.
/// </summary>
public interface ICaaCheckService
{
    /// <summary>
    /// Checks whether the CA is authorized to issue a certificate for the given domain.
    /// For wildcard domains, the <c>issuewild</c> CAA property is checked; for non-wildcard
    /// domains, the <c>issue</c> property is checked.
    /// </summary>
    /// <param name="domain">The base domain to check (without wildcard prefix).</param>
    /// <param name="isWildcard">Whether this is a wildcard certificate request.</param>
    /// <returns>True if issuance is allowed (no CAA records, or CA is authorized); false if CAA records deny issuance.</returns>
    Task<bool> IsIssuanceAllowedAsync(string domain, bool isWildcard);
}
