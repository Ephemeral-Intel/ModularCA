using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Core.Services;

/// <summary>
/// Database-backed protocol rate-limit reader with per-scope in-memory caching.
/// Matches the <see cref="FeatureFlagService"/> pattern — one read per request scope,
/// re-queried on the next scope or after <see cref="InvalidateCache"/>.
/// </summary>
public class ProtocolRateLimitService : IProtocolRateLimitService
{
    private readonly ModularCADbContext _db;
    private IReadOnlyDictionary<string, (int MaxRequests, int WindowMinutes)>? _cache;
    private readonly object _lock = new();

    public ProtocolRateLimitService(ModularCADbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyDictionary<string, (int MaxRequests, int WindowMinutes)>> GetAllAsync()
    {
        if (_cache != null)
            return _cache;

        IReadOnlyDictionary<string, (int MaxRequests, int WindowMinutes)> map;
        try
        {
            var rows = await _db.ProtocolRateLimits
                .AsNoTracking()
                .ToListAsync();

            map = rows.ToDictionary(
                r => r.Protocol,
                r => (r.MaxRequests, r.WindowMinutes),
                StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            // DB unavailable (setup mode, pending migrations, connection refused,
            // table missing). Return an empty map so the middleware falls back to
            // its built-in DefaultLimits. Caching the empty map avoids re-hitting
            // a bad DB on every request in this scope.
            map = new Dictionary<string, (int MaxRequests, int WindowMinutes)>(StringComparer.OrdinalIgnoreCase);
        }

        lock (_lock)
        {
            _cache ??= map;
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
