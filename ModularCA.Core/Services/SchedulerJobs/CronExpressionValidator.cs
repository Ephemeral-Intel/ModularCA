using NCrontab;

namespace ModularCA.Core.Services.SchedulerJobs;

/// <summary>
/// Centralized cron-expression validator. Used at startup (fail-fast) and by
/// <c>AdminConfigController</c> on config mutation so a typo is rejected before
/// it silently disables the associated job.
/// </summary>
public static class CronExpressionValidator
{
    /// <summary>
    /// Attempts to parse a cron expression with <c>CrontabSchedule.TryParse</c>.
    /// Returns <c>true</c> on success; <c>false</c> with <paramref name="error"/>
    /// populated on failure.
    /// </summary>
    public static bool TryValidate(string? cron, out string error)
    {
        error = string.Empty;
        if (string.IsNullOrWhiteSpace(cron))
        {
            error = "cron expression is null or empty";
            return false;
        }

        try
        {
            var schedule = CrontabSchedule.TryParse(cron);
            if (schedule == null)
            {
                error = $"invalid cron expression: '{cron}'";
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            error = $"cron parse failed for '{cron}': {ex.Message}";
            return false;
        }
    }

    /// <summary>
    /// Validates a dictionary of named cron expressions (e.g. <c>"AutoRenewal"=&gt;"0 4 * * *"</c>).
    /// Returns the list of failures — empty list means all valid.
    /// </summary>
    public static List<string> ValidateAll(IReadOnlyDictionary<string, string?> named)
    {
        var errors = new List<string>();
        foreach (var (name, expr) in named)
        {
            if (!TryValidate(expr, out var err))
                errors.Add($"{name}: {err}");
        }
        return errors;
    }
}
