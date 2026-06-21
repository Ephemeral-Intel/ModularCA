using ModularCA.Shared.Models.Crl;

namespace ModularCA.Shared.Interfaces
{
    /// <summary>
    /// Manages CRL generation configuration including schedules, intervals, and delta CRL settings.
    /// </summary>
    public interface ICrlConfigurationService
    {
        /// <summary>
        /// Returns the CRL configuration for a specific CA certificate.
        /// Replaces the legacy parameterless overload which returned an arbitrary first row
        /// and silently broke multi-CA deployments.
        /// </summary>
        Task<CrlConfigurationDto> GetByCaAsync(Guid caCertificateId);

        /// <summary>
        /// Updates an existing CRL configuration.
        /// </summary>
        Task UpdateAsync(UpdateCrlConfigurationRequest request);

        /// <summary>
        /// Returns all CRL configurations.
        /// </summary>
        Task<IEnumerable<CrlConfigurationDto>> GetAllAsync();

        /// <summary>
        /// Gets a CRL configuration by its ID.
        /// </summary>
        Task<CrlConfigurationDto> GetByIdAsync(Guid id);

        /// <summary>
        /// Creates a new CRL configuration from the given request.
        /// </summary>
        Task<CrlConfigurationDto> CreateAsync(CreateCrlConfigurationRequest request);

        /// <summary>
        /// Enables or disables a CRL configuration by ID.
        /// </summary>
        Task SetEnabledAsync(Guid id, bool enabled);

        /// <summary>
        /// Deletes a CRL configuration by ID.
        /// </summary>
        Task DeleteAsync(Guid id);
    }

}
