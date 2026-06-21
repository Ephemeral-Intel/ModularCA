namespace ModularCA.Shared.Interfaces
{
    public interface ICrlService
    {
        /// <summary>
        /// Generates a new full CRL for the specified CA certificate.
        /// </summary>
        Task<string> GenerateCrlAsync(Guid caCertificateId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Generates a delta CRL containing only revocations since the last full CRL.
        /// RFC 5280 §5.2.4 — includes DeltaCRLIndicator extension.
        /// </summary>
        Task<string> GenerateDeltaCrlAsync(Guid caCertificateId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets the latest full CRL for the specified CA certificate.
        /// </summary>
        Task<string?> GetLatestCrlAsync(Guid caCertificateId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets the latest delta CRL for the specified CA certificate.
        /// </summary>
        Task<string?> GetLatestDeltaCrlAsync(Guid caCertificateId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Returns the latest full CRL as its stored DER blob together
        /// with the caching metadata (<c>ThisUpdate</c>, <c>NextUpdate</c>, <c>CrlNumber</c>) so
        /// public controllers can set <c>Cache-Control</c>/<c>ETag</c>/<c>Last-Modified</c>
        /// headers without re-parsing PEM on every hit.
        /// </summary>
        Task<CrlBlob?> GetLatestCrlRawAsync(Guid caCertificateId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Delta CRL variant of
        /// <see cref="GetLatestCrlRawAsync"/>.
        /// </summary>
        Task<CrlBlob?> GetLatestDeltaCrlRawAsync(Guid caCertificateId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Immutable CRL payload returned by <see cref="ICrlService.GetLatestCrlRawAsync"/> — the raw
    /// DER bytes plus the metadata the HTTP controllers use to build cache headers. Added
    /// to eliminate the PEM round-trip on every public CRL fetch.
    /// </summary>
    public sealed record CrlBlob(
        byte[] Der,
        DateTime ThisUpdate,
        DateTime NextUpdate,
        long CrlNumber);
}
