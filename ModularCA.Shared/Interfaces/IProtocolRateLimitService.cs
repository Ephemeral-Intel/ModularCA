using ModularCA.Shared.Entities;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Cached reader for <see cref="ProtocolRateLimitEntity"/> rows. Writers (the admin
/// controller) mutate the table directly and call <see cref="InvalidateCache"/> so
/// the next read re-queries the DB.
/// </summary>
public interface IProtocolRateLimitService
{
    /// <summary>
    /// Returns all configured protocol limits as a case-insensitive map from
    /// protocol name to (maxRequests, windowMinutes). Protocols with no row
    /// fall back to middleware-built-in defaults and are NOT present in this map.
    /// </summary>
    Task<IReadOnlyDictionary<string, (int MaxRequests, int WindowMinutes)>> GetAllAsync();

    /// <summary>
    /// Clears the in-memory cache so the next <see cref="GetAllAsync"/> re-queries the DB.
    /// </summary>
    void InvalidateCache();
}
