using ModularCA.Shared.Interfaces;

namespace ModularCA.Bootstrap;

/// <summary>
/// Thin adapter that exposes <see cref="BackupRestore.Backup(string?)"/> through the
/// <see cref="IBackupArchiver"/> interface so Core-layer scheduler jobs can trigger
/// backups without Core having to reference Bootstrap.
/// </summary>
public class BackupArchiver : IBackupArchiver
{
    /// <inheritdoc />
    public Task<int> CreateArchiveAsync(string outputPath, CancellationToken cancellationToken = default)
    {
        // BackupRestore.Backup doesn't accept a token today; if cancellation is
        // requested we honour it before kicking off the (synchronous, zip-writing)
        // archive routine. Mid-archive cancellation would require plumbing through
        // BackupRestore — out of scope for this wiring.
        cancellationToken.ThrowIfCancellationRequested();
        return BackupRestore.Backup(outputPath);
    }
}
