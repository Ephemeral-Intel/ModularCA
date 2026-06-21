using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Core.Services;

/// <summary>
/// Database-backed security policy reader with per-scope in-memory caching.
/// Matches the <see cref="FeatureFlagService"/> pattern — a single read per
/// request scope, re-queried on the next scope or after <see cref="InvalidateCache"/>.
/// </summary>
public class SecurityPolicyService : ISecurityPolicyService
{
    private readonly ModularCADbContext _db;
    private SecurityPolicyEntity? _cache;
    private readonly object _lock = new();

    public SecurityPolicyService(ModularCADbContext db)
    {
        _db = db;
    }

    public async Task<SecurityPolicyEntity> GetAsync()
    {
        if (_cache != null)
            return _cache;

        SecurityPolicyEntity row;
        try
        {
            row = await _db.SecurityPolicies
                .AsNoTracking()
                .FirstOrDefaultAsync()
                ?? new SecurityPolicyEntity();
        }
        catch
        {
            // DB unavailable (setup mode, pending migrations, connection refused).
            // Return a default-valued entity so callers still get sane numbers.
            // Caching avoids re-hitting a bad DB on every read in this scope.
            row = new SecurityPolicyEntity();
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
