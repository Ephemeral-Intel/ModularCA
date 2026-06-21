using System.Diagnostics;

namespace ModularCA.Core.Helpers;

/// <summary>
/// Runs external processes asynchronously with timeout support and captured output.
/// </summary>
public static class ProcessRunner
{
    /// <summary>
    /// Executes a command asynchronously, returning the exit code, stdout, and stderr.
    /// </summary>
    public static async Task<(int ExitCode, string Stdout, string Stderr)> RunAsync(
        string command, string arguments, int timeoutMs = 30000)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();

        var completed = await Task.Run(() => process.WaitForExit(timeoutMs));
        if (!completed)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException($"Process '{command}' timed out after {timeoutMs}ms");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        return (process.ExitCode, stdout, stderr);
    }
}
