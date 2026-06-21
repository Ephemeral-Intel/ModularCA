using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Core.Services;

/// <summary>
/// Database-backed LDAP publisher policy reader with per-scope in-memory caching.
/// Matches the <see cref="FeatureFlagService"/> pattern.
/// </summary>
public class LdapPublisherPolicyService : ILdapPublisherPolicyService
{
    private readonly ModularCADbContext _db;
    private LdapPublisherPolicyEntity? _cache;
    private readonly object _lock = new();

    public LdapPublisherPolicyService(ModularCADbContext db)
    {
        _db = db;
    }

    public async Task<LdapPublisherPolicyEntity> GetAsync()
    {
        if (_cache != null)
            return _cache;

        LdapPublisherPolicyEntity row;
        try
        {
            row = await _db.LdapPublisherPolicies
                .AsNoTracking()
                .FirstOrDefaultAsync()
                ?? new LdapPublisherPolicyEntity();
        }
        catch
        {
            // DB unavailable (setup mode, pending migrations, connection refused).
            // Return a default-valued entity so the LDAP publisher job dispatcher
            // treats Enabled=false correctly even pre-bootstrap.
            row = new LdapPublisherPolicyEntity();
        }

        lock (_lock)
        {
            _cache ??= row;
            return _cache;
        }
    }

    public void InvalidateCache()
    {
        lock (_lock)
        {
            _cache = null;
        }
    }
}
