using DnsClient;
using Microsoft.Extensions.Logging;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services.Acme;

/// <summary>
/// Checks CAA DNS records to determine whether this CA is authorized to issue certificates
/// for a given domain, per RFC 8659. When <see cref="AcmeConfig.EnforceCaa"/> is false
/// (the default for internal CAs), all issuance is permitted without DNS queries.
/// </summary>
public class CaaCheckService(SystemConfig config, ILogger<CaaCheckService> logger) : ICaaCheckService
{
    private readonly AcmeConfig _acmeConfig = config.Acme;
    private readonly ILogger<CaaCheckService> _logger = logger;

    /// <summary>
    /// The CA identity string to match against CAA <c>issue</c> / <c>issuewild</c> property values.
    /// </summary>
    private const string CaIdentity = "modularca";

    /// <inheritdoc />
    public async Task<bool> IsIssuanceAllowedAsync(string domain, bool isWildcard)
    {
        if (!_acmeConfig.EnforceCaa)
            return true;

        try
        {
            var lookup = new LookupClient();
            var propertyTag = isWildcard ? "issuewild" : "issue";

            // Walk up the domain hierarchy checking for CAA records (RFC 8659 §4)
            var currentDomain = domain;
            while (!string.IsNullOrEmpty(currentDomain) && currentDomain.Contains('.'))
            {
                var result = await lookup.QueryAsync(currentDomain, QueryType.CAA);
                var caaRecords = result.Answers.CaaRecords().ToList();

                if (caaRecords.Count > 0)
                {
                    // Check for matching tag
                    var matchingRecords = caaRecords
                        .Where(r => string.Equals(r.Tag, propertyTag, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    // If no records with the specific tag, fall back to "issue" for wildcard checks
                    if (matchingRecords.Count == 0 && isWildcard)
                    {
                        matchingRecords = caaRecords
                            .Where(r => string.Equals(r.Tag, "issue", StringComparison.OrdinalIgnoreCase))
                            .ToList();
                    }

                    // If there are matching records, check if our CA is authorized
                    if (matchingRecords.Count > 0)
                    {
                        var isAllowed = matchingRecords.Any(r =>
                            string.Equals(r.Value.Trim(), CaIdentity, StringComparison.OrdinalIgnoreCase));

                        if (!isAllowed)
                        {
                            _logger.LogWarning(
                                "CAA record for {Domain} does not authorize CA identity '{CaIdentity}' (tag: {Tag})",
                                currentDomain, CaIdentity, propertyTag);
                        }

                        return isAllowed;
                    }

                    // CAA records exist but none with issue/issuewild tag — issuance is allowed
                    return true;
                }

                // Move up to parent domain
                var dotIndex = currentDomain.IndexOf('.');
                currentDomain = dotIndex >= 0 ? currentDomain[(dotIndex + 1)..] : string.Empty;
            }

            // No CAA records found at any level — issuance is allowed
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CAA lookup failed for domain {Domain}; denying issuance as a precaution", domain);
            // Fail-closed: deny issuance when CAA cannot be verified
            return false;
        }
    }
}
