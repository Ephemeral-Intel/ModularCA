namespace ModularCA.Core.Services;

/// <summary>
/// Calculates a health score (0-100) for certificates based on key strength,
/// algorithm safety, validity period, revocation status, and vulnerability findings.
/// </summary>
public interface ICertHealthScoreService
{
    /// <summary>
    /// Calculates the health score for a single certificate identified by its primary key.
    /// </summary>
    /// <param name="certificateId">The unique identifier of the certificate.</param>
    /// <returns>A <see cref="CertHealthScore"/> containing the numeric score, letter grade, and contributing factors.</returns>
    Task<CertHealthScore> CalculateScoreAsync(Guid certificateId);

    /// <summary>
    /// Calculates health scores for multiple certificates in a single batch.
    /// </summary>
    /// <param name="certificateIds">The list of certificate identifiers to evaluate.</param>
    /// <returns>A list of <see cref="CertHealthScore"/> results, one per certificate.</returns>
    Task<List<CertHealthScore>> CalculateBulkScoresAsync(List<Guid> certificateIds);
}

/// <summary>
/// Represents the overall health assessment of a single certificate.
/// </summary>
public class CertHealthScore
{
    /// <summary>The certificate this score applies to.</summary>
    public Guid CertificateId { get; set; }

    /// <summary>Numeric health score from 0 (worst) to 100 (best).</summary>
    public int Score { get; set; }

    /// <summary>Letter grade derived from the score: A (90-100), B (80-89), C (70-79), D (60-69), F (&lt;60).</summary>
    public string Grade { get; set; } = string.Empty;

    /// <summary>Individual factors that contributed to point deductions.</summary>
    public List<CertHealthFactor> Factors { get; set; } = new();
}

/// <summary>
/// A single factor that reduced a certificate's health score.
/// </summary>
public class CertHealthFactor
{
    /// <summary>Short name of the factor (e.g. "WeakRsaKey", "Sha1Signature").</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Number of points deducted for this factor (always positive).</summary>
    public int Points { get; set; }

    /// <summary>Human-readable explanation of the issue.</summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>Severity level: Critical, Warning, or Info.</summary>
    public string Severity { get; set; } = string.Empty;
}
