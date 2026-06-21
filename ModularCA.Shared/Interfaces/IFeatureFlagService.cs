namespace ModularCA.Shared.Interfaces
{
    /// <summary>
    /// Provides access to feature flags for enabling or configuring optional system behaviors.
    /// </summary>
    public interface IFeatureFlagService
    {
        /// <summary>
        /// Returns whether the specified feature flag is enabled.
        /// </summary>
        bool IsEnabled(string flagName);

        /// <summary>
        /// Gets the optional value associated with a feature flag.
        /// </summary>
        string? GetValue(string flagName);

        /// <summary>
        /// Gets both the enabled status and value of a feature flag, or null if not found.
        /// </summary>
        (bool Enabled, string? Value)? Get(string flagName);

        /// <summary>
        /// Invalidates the in-memory cache so the next lookup re-queries the database.
        /// </summary>
        void InvalidateCache();
    }
}
