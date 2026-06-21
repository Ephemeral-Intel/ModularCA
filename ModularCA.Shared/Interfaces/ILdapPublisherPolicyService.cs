using ModularCA.Shared.Entities;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Cached reader for <see cref="LdapPublisherPolicyEntity"/>. Writers (the admin
/// controller) write to the DB directly and then call <see cref="InvalidateCache"/>
/// so the next read re-queries the row.
/// </summary>
public interface ILdapPublisherPolicyService
{
    /// <summary>
    /// Returns the current LDAP publisher policy. Falls back to a default-valued
    /// entity (not persisted) when no row exists — this only happens before
    /// bootstrap seeding.
    /// </summary>
    Task<LdapPublisherPolicyEntity> GetAsync();

    /// <summary>
    /// Clears the in-memory cache so the next <see cref="GetAsync"/> re-queries the DB.
    /// </summary>
    void InvalidateCache();
}
