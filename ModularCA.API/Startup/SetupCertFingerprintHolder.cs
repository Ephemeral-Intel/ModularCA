namespace ModularCA.API.Startup;

/// <summary>
/// Process-wide holder for the setup-mode self-signed certificate
/// fingerprint. Populated from <c>StartModularCA</c> when the setup listener is configured,
/// read by <c>GET /api/v1/setup/fingerprint</c> so the wizard SPA can display the same
/// value the server printed on its console at boot. The operator is expected to compare
/// these two values (and optionally the browser's cert-details dialog) before entering
/// any credentials into the wizard.
/// </summary>
internal static class SetupCertFingerprintHolder
{
    private static string? _fingerprint;

    /// <summary>
    /// Stores the SHA-256 fingerprint of the setup-mode self-signed Web TLS cert. Called
    /// once from startup after <c>GenerateSetupTlsCert</c> creates the cert.
    /// </summary>
    public static void SetFingerprint(string fingerprint)
    {
        _fingerprint = fingerprint;
    }

    /// <summary>
    /// Returns the fingerprint string stored by <see cref="SetFingerprint"/>, or
    /// <c>null</c> when the app is not running in setup mode (no setup cert was generated).
    /// </summary>
    public static string? GetFingerprint() => _fingerprint;
}
