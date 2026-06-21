namespace ModularCA.Core.Models;

/// <summary>
/// Represents the effective (merged) certificate profile after resolving inheritance.
/// Each field value is either inherited from the parent or overridden by the child.
/// </summary>
public class EffectiveCertProfile
{
    /// <summary>
    /// The ID of the child (source) profile that was resolved.
    /// </summary>
    public Guid SourceProfileId { get; set; }

    /// <summary>
    /// The ID of the parent profile, if inheritance is active. Null for standalone profiles.
    /// </summary>
    public Guid? ParentProfileId { get; set; }

    /// <summary>
    /// Profile display name. Always comes from the child profile (identity field).
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Profile description. Always comes from the child profile (identity field).
    /// </summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Whether this profile is for CA certificates.
    /// </summary>
    public bool IsCaProfile { get; set; }

    /// <summary>
    /// Comma-separated key usage flags (e.g., "digitalSignature,keyCertSign").
    /// </summary>
    public string KeyUsages { get; set; } = string.Empty;

    /// <summary>
    /// Comma-separated OIDs for extended key usages.
    /// </summary>
    public string ExtendedKeyUsages { get; set; } = string.Empty;

    /// <summary>
    /// Minimum validity period in ISO 8601 duration format.
    /// </summary>
    public string? ValidityPeriodMin { get; set; }

    /// <summary>
    /// Maximum validity period in ISO 8601 duration format.
    /// </summary>
    public string? ValidityPeriodMax { get; set; }

    /// <summary>
    /// JSON array of allowed key algorithms (e.g., ["RSA", "ECDSA"]).
    /// </summary>
    public string AllowedKeyAlgorithms { get; set; } = "[]";

    /// <summary>
    /// JSON array of allowed key sizes (e.g., [2048, 4096]).
    /// </summary>
    public string AllowedKeySizes { get; set; } = "[]";

    /// <summary>
    /// JSON array of allowed signature algorithms.
    /// </summary>
    public string AllowedSignatureAlgorithms { get; set; } = "[]";

    /// <summary>
    /// Whether Certificate Transparency submission is enabled.
    /// </summary>
    public bool CtEnabled { get; set; }

    /// <summary>
    /// Whether wildcard SAN/CN entries are permitted by this profile. When false, any DNS
    /// SAN containing <c>*</c> is rejected at issuance time. Mirrored from
    /// <see cref="ModularCA.Shared.Entities.CertProfileEntity.AllowWildcard"/>.
    /// </summary>
    public bool AllowWildcard { get; set; }

    /// <summary>
    /// JSON array of CT log GUIDs to submit to. Null means use all enabled CT logs.
    /// </summary>
    public string? CtLogIds { get; set; }

    /// <summary>
    /// Maps field names to their source: "inherited" or "overridden".
    /// Used by the UI to visually distinguish inherited vs overridden values.
    /// </summary>
    public Dictionary<string, string> FieldSources { get; set; } = new();
}
