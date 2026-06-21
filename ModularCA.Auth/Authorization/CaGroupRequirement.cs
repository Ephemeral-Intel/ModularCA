using Microsoft.AspNetCore.Authorization;

namespace ModularCA.Auth.Authorization;

/// <summary>
/// Authorization requirement specifying a capability that must be present in the user's grants.
/// For CA-scoped policies, the handler resolves the target CA from the route.
/// For system-only policies, only system group memberships are checked.
/// </summary>
public class CaGroupRequirement : IAuthorizationRequirement
{
    /// <summary>
    /// The capability required (e.g. "cert.view", "cert.revoke", "system.manage").
    /// </summary>
    public string RequiredCapability { get; }

    /// <summary>
    /// When true, only system-level group memberships satisfy this requirement.
    /// </summary>
    public bool IsSystemOnly { get; }

    /// <summary>
    /// Initializes a new instance of <see cref="CaGroupRequirement"/>.
    /// </summary>
    /// <param name="requiredCapability">The capability that must be granted.</param>
    /// <param name="isSystemOnly">If true, only system groups are checked.</param>
    public CaGroupRequirement(string requiredCapability, bool isSystemOnly = false)
    {
        RequiredCapability = requiredCapability;
        IsSystemOnly = isSystemOnly;
    }
}
