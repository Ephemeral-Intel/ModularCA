using ModularCA.Shared.Models.Acme;

namespace ModularCA.Shared.Interfaces;

public interface IAcmeOrderService
{
    /// <summary><paramref name="caLabel"/> plumbs the per-CA route segment so <c>ICaResolverService</c> picks the right CA context at order time.</summary>
    Task<AcmeOrderDto> CreateAsync(Guid accountId, CreateAcmeOrderRequest request, string baseUrl, string? caLabel = null);
    Task<AcmeOrderDto?> GetByIdAsync(Guid orderId, string baseUrl);
    Task<List<AcmeOrderDto>> GetByAccountAsync(Guid accountId, string baseUrl);
    /// <summary><paramref name="caLabel"/> override for finalize. Defaults to the order's stored CaLabel when null.</summary>
    Task<AcmeOrderDto> FinalizeAsync(Guid orderId, string csrBase64Url, string baseUrl, string? caLabel = null);
    Task<string?> DownloadCertificateAsync(Guid orderId);

    /// <summary>
    /// Retrieves the account ID that owns the specified order.
    /// </summary>
    Task<Guid?> GetAccountIdForOrderAsync(Guid orderId);

    /// <summary>
    /// Retrieves the account ID that owns the ACME order associated with the given certificate serial number.
    /// Returns null if no ACME order is linked to that serial.
    /// </summary>
    Task<Guid?> GetAccountIdForCertificateSerialAsync(string serialNumber);

    /// <summary>
    /// Audit findings #28: returns the issued certificate's serial number for an ACME order
    /// so the controller can include it in the <c>AcmeOrderFinalized</c> audit payload without
    /// reaching into the database directly. Returns null if the order has not yet issued a cert.
    /// </summary>
    Task<string?> GetIssuedCertificateSerialForOrderAsync(Guid orderId);

    /// <summary>Honor the scheduler job token.</summary>
    Task ExpireStaleOrdersAsync(CancellationToken cancellationToken = default);
    /// <summary>Honor the scheduler job token.</summary>
    Task<bool> HasStaleOrdersAsync(CancellationToken cancellationToken = default);
}
