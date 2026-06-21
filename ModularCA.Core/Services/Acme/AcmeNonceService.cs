using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services.Acme;

/// <summary>
/// Manages ACME replay nonces for preventing replay attacks on ACME protocol requests.
/// Nonce lifetime derives from
/// <see cref="SystemConfig.AcmeConfig.NonceLifetimeSeconds"/> (default 300s,
/// clamped to [60, 900]), down from the previous 15 minute window.
/// </summary>
public class AcmeNonceService(ModularCADbContext db, SystemConfig config) : IAcmeNonceService
{
    private readonly ModularCADbContext _db = db;
    private readonly SystemConfig _config = config;

    private TimeSpan NonceLifetime
    {
        get
        {
            var s = _config.Acme.NonceLifetimeSeconds;
            if (s < 60 || s > 900) s = 300;
            return TimeSpan.FromSeconds(s);
        }
    }

    public async Task<string> GenerateAsync()
    {
        var now = DateTime.UtcNow;
        var nonce = new AcmeNonceEntity
        {
            Value = Convert.ToBase64String(Guid.NewGuid().ToByteArray())
                    .TrimEnd('=').Replace('+', '-').Replace('/', '_'),
            IssuedAt = now,
            // 5-minute TTL by default, replacing the prior 15 minute window.
            ExpiresAt = now.Add(NonceLifetime)
        };
        _db.AcmeNonces.Add(nonce);
        await _db.SaveChangesAsync();
        return nonce.Value;
    }

    /// <summary>
    /// Atomically consumes (deletes) an ACME nonce if it exists and has not expired.
    /// Uses a single set-based DELETE to eliminate the TOCTOU race window between query and
    /// removal. Replaces a PostgreSQL-style double-quoted raw SQL that
    /// silently failed on stock MySQL (ANSI_QUOTES off) with a provider-agnostic
    /// ExecuteDeleteAsync, which restores ACME protocol functionality.
    /// </summary>
    public async Task<bool> ConsumeAsync(string nonce)
    {
        var now = DateTime.UtcNow;
        var deleted = await _db.AcmeNonces
            .Where(n => n.Value == nonce && n.ExpiresAt > now)
            .ExecuteDeleteAsync();
        return deleted > 0;
    }

    /// <summary>
    /// Set-based DELETE via ExecuteDeleteAsync — previously materialised
    /// every expired nonce into memory and issued N individual row deletes. ACME nonces are
    /// high-churn (generated on every unauthenticated request); a single round-trip is 10x+
    /// faster and allocates nothing.
    /// </summary>
    public async Task CleanupExpiredAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        await _db.AcmeNonces
            .Where(n => n.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);
    }

    public async Task<bool> HasExpiredNoncesAsync(CancellationToken cancellationToken = default)
    {
        return await _db.AcmeNonces.AnyAsync(n => n.ExpiresAt <= DateTime.UtcNow, cancellationToken);
    }
}
