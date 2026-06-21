namespace ModularCA.Shared.Interfaces;

public interface ITimestampService
{
    Task<byte[]> ProcessTimestampRequestAsync(byte[] tsqBytes, string? caLabel = null);
}
