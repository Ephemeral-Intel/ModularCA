namespace ModularCA.Shared.Models.RequestProfiles;

/// <summary>
/// Defines the validation rule for a single subject DN component (e.g., CN, O, OU).
/// </summary>
public class SubjectDnFieldRule
{
    /// <summary>DN field name: CN, O, OU, L, ST, C, DC, etc.</summary>
    public string Field { get; set; } = string.Empty;

    /// <summary>Required = must be present, Optional = may be present, Forbidden = must not be present.</summary>
    public string Requirement { get; set; } = "Optional"; // Required, Optional, Forbidden

    /// <summary>If set, this value is always used and the requester cannot override it.</summary>
    public string? FixedValue { get; set; }

    /// <summary>Regex pattern the value must match (only checked if value is provided).</summary>
    public string? Regex { get; set; }

    /// <summary>Maximum length of the field value.</summary>
    public int? MaxLength { get; set; }

    /// <summary>Default value used if the requester doesn't provide one.</summary>
    public string? DefaultValue { get; set; }
}
