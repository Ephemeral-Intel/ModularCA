using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Core.Services
{
    /// <summary>
    /// Database-backed feature flag service with in-memory caching for fast lookups.
    /// Call <see cref="InvalidateCache"/> after updating a flag so the next read re-queries the database.
    /// </summary>
    public class FeatureFlagService : IFeatureFlagService
    {
        private readonly ModularCADbContext _db;
        private Dictionary<string, (bool Enabled, string? Value)>? _cache;
        private readonly object _lock = new();

        public FeatureFlagService(ModularCADbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// Returns whether the specified feature flag is enabled.
        /// </summary>
        public bool IsEnabled(string flagName)
        {
            var cache = EnsureCache();
            return cache.TryGetValue(flagName, out var result) && result.Enabled;
        }

        /// <summary>
        /// Gets the optional value associated with a feature flag.
        /// </summary>
        public string? GetValue(string flagName)
        {
            var cache = EnsureCache();
            return cache.TryGetValue(flagName, out var result) ? result.Value : null;
        }

        /// <summary>
        /// Gets both the enabled status and value of a feature flag, or null if not found.
        /// </summary>
        public (bool Enabled, string? Value)? Get(string flagName)
        {
            var cache = EnsureCache();
            return cache.TryGetValue(flagName, out var result) ? result : null;
        }

        /// <summary>
        /// Invalidates the in-memory cache so the next lookup re-queries the database.
        /// </summary>
        public void InvalidateCache()
        {
            lock (_lock)
            {
                _cache = null;
            }
        }

        /// <summary>
        /// Lazily loads the cache from the database on first access or after invalidation.
        /// </summary>
        private Dictionary<string, (bool Enabled, string? Value)> EnsureCache()
        {
            if (_cache != null)
                return _cache;

            lock (_lock)
            {
                _cache ??= _db.FeatureFlags
                    .AsNoTracking()
                    .ToDictionary(f => f.Name, f => (f.Enabled, f.Value));
                return _cache;
            }
        }
    }
}
