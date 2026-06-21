namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Creates a backup archive at the specified output path. Extracted so
/// <c>ModularCA.Core</c> scheduler jobs can trigger backups without taking a project
/// reference on <c>ModularCA.Bootstrap</c> (which would be a cyclic dependency since
/// Bootstrap already references Core).
/// </summary>
public interface IBackupArchiver
{
    /// <summary>
    /// Creates a new backup archive at <paramref name="outputPath"/>. Returns the exit
    /// code from the underlying archive routine (0 = success).
    /// </summary>
    /// <param name="outputPath">Absolute path to the archive file to write.</param>
    /// <param name="cancellationToken">Token to signal cancellation.</param>
    Task<int> CreateArchiveAsync(string outputPath, CancellationToken cancellationToken = default);
}
