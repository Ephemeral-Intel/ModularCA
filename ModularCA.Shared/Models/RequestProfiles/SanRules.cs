namespace ModularCA.Shared.Models.RequestProfiles;

/// <summary>
/// Defines SAN (Subject Alternative Name) constraints for enrollment requests.
/// </summary>
public class SanRules
{
    /// <summary>Allowed SAN types: DNS, IP, Email, URI.</summary>
    public List<string> AllowedTypes { get; set; } = new() { "DNS", "IP" };

    /// <summary>Whether at least one SAN is required.</summary>
    public bool Required { get; set; } = false;

    /// <summary>Per-type rules (key = SAN type like "DNS").</summary>
    public Dictionary<string, SanTypeRule> Rules { get; set; } = new();
}

/// <summary>
/// Validation rules for a specific SAN type.
/// </summary>
public class SanTypeRule
{
    /// <summary>Regex pattern each SAN value of this type must match.</summary>
    public string? Regex { get; set; }

    /// <summary>Maximum number of SANs of this type allowed.</summary>
    public int MaxCount { get; set; } = 100;
}
