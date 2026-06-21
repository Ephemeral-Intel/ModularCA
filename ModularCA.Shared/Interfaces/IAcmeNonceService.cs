namespace ModularCA.Shared.Interfaces;

public interface IAcmeNonceService
{
    Task<string> GenerateAsync();
    Task<bool> ConsumeAsync(string nonce);
    /// <summary>Honor the scheduler job token.</summary>
    Task CleanupExpiredAsync(CancellationToken cancellationToken = default);
    /// <summary>Honor the scheduler job token.</summary>
    Task<bool> HasExpiredNoncesAsync(CancellationToken cancellationToken = default);
}
