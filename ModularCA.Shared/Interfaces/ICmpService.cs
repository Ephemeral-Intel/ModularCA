namespace ModularCA.Shared.Interfaces;

public interface ICmpService
{
    /// <summary>
    /// Processes a DER-encoded CMP PKIMessage and returns a DER-encoded PKIMessage response.
    /// Supports ir (initialization), cr (certification), kur (key update),
    /// rr (revocation), certConf (certificate confirm), and genm (general message).
    /// See RFC 4210 / RFC 6712.
    /// </summary>
    Task<byte[]> ProcessRequestAsync(byte[] derRequest, string? caLabel = null, string? sourceIp = null);
}
