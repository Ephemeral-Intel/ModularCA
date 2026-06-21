namespace ModularCA.Shared.Models.Csr;

/// <summary>
/// Request body for validating parsed CSR fields against a request profile's rules.
/// </summary>
public class ValidateAgainstProfileRequest
{
    /// <summary>
    /// The request profile ID to validate against.
    /// </summary>
    public Guid RequestProfileId { get; set; }

    /// <summary>
    /// Subject DN fields to validate (keyed by field name: CN, O, OU, etc.).
    /// </summary>
    public Dictionary<string, string> Subject { get; set; } = new();

    /// <summary>
    /// SAN entries to validate.
    /// </summary>
    public List<SanEntry> Sans { get; set; } = new();
}

/// <summary>
/// Response from validating CSR fields against a request profile.
/// </summary>
public class ValidateAgainstProfileResponse
{
    /// <summary>
    /// Overall validation result. True if no errors (warnings are acceptable).
    /// </summary>
    public bool Valid { get; set; }

    /// <summary>
    /// Validation results for each subject DN field.
    /// </summary>
    public List<FieldValidationResult> FieldResults { get; set; } = new();

    /// <summary>
    /// Validation results for each SAN entry.
    /// </summary>
    public List<SanValidationResult> SanResults { get; set; } = new();
}

/// <summary>
/// Validation result for a single subject DN field.
/// </summary>
public class FieldValidationResult
{
    /// <summary>DN field name (CN, O, OU, etc.).</summary>
    public string Field { get; set; } = string.Empty;

    /// <summary>Validation status: valid, warning, error.</summary>
    public string Status { get; set; } = "valid";

    /// <summary>Human-readable message explaining the validation result.</summary>
    public string? Message { get; set; }
}

/// <summary>
/// Validation result for a single SAN entry.
/// </summary>
public class SanValidationResult
{
    /// <summary>SAN type (DNS, IP, Email, URI).</summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>SAN value.</summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>Validation status: valid, warning, error.</summary>
    public string Status { get; set; } = "valid";

    /// <summary>Human-readable message explaining the validation result.</summary>
    public string? Message { get; set; }
}
