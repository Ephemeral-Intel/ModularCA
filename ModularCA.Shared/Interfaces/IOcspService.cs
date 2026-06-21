namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Processes OCSP requests and returns signed OCSP responses.
/// The contract carries the route-scoping <paramref name="caLabel"/>
/// down from the controller and a <see cref="System.Threading.CancellationToken"/>
/// so in-flight signing work can abort when the client disconnects.
/// </summary>
public interface IOcspService
{
    /// <summary>
    /// Processes a DER-encoded OCSP request and returns a DER-encoded OCSP response.
    /// </summary>
    /// <param name="derRequest">The raw DER-encoded OCSPRequest bytes.</param>
    /// <param name="caLabel">
    /// When the request arrived on a <c>/ocsp/ca/{caLabel}</c>
    /// route, the responder binds <paramref name="caLabel"/> to the CA label
    /// and refuses to answer for any other CA. Null or empty means the route
    /// is the unscoped <c>/ocsp</c> and any matching signer is acceptable.
    /// </param>
    /// <param name="result">
    /// Reports the final <see cref="Org.BouncyCastle.Ocsp.OcspRespStatus"/>
    /// back to the caller. The controller uses it to label the
    /// <c>OcspRequests</c> metric so real failures are visible to Prometheus.
    /// </param>
    /// <param name="cancellationToken">
    /// Threaded through DB + keystore calls so client-abort
    /// stops the in-flight signing work.
    /// </param>
    Task<byte[]> ProcessOcspRequestAsync(
        byte[] derRequest,
        string? caLabel,
        OcspProcessingResult result,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Out-parameter bundle reporting how the responder resolved
/// a given request so the controller can label the
/// <c>modularca_ocsp_requests_total</c> metric with the actual outcome.
/// </summary>
public sealed class OcspProcessingResult
{
    /// <summary>
    /// RFC 6960 <c>OCSPResponseStatus</c> returned to the client:
    /// <c>ok</c>, <c>malformedRequest</c>, <c>internalError</c>,
    /// <c>tryLater</c>, <c>sigRequired</c>, or <c>unauthorized</c>.
    /// </summary>
    public string Status { get; set; } = "unknown";

    /// <summary>
    /// The CA label the responder resolved the request to, when known.
    /// Used as the <c>ca_label</c> metric label so operators can slice
    /// OCSP health per CA.
    /// </summary>
    public string CaLabel { get; set; } = string.Empty;

    /// <summary>
    /// The value, in seconds, of the <c>nextUpdate - now</c> delta on the
    /// response. The controller uses it to emit a <c>Cache-Control: max-age</c>
    /// header so intermediate caches see the same TTL the responder baked in.
    /// Zero when there is no <c>nextUpdate</c> to derive a TTL from (e.g.
    /// <c>malformedRequest</c>, <c>unauthorized</c>).
    /// </summary>
    public int CacheMaxAgeSeconds { get; set; }
}
