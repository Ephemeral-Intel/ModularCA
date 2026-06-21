using ModularCA.Shared.Models.CertProfiles;

namespace ModularCA.Shared.Interfaces
{
    /// <summary>
    /// Manages certificate profiles that define extension templates and constraints.
    /// </summary>
    public interface ICertProfileService
    {
        /// <summary>
        /// Returns all certificate profiles.
        /// </summary>
        Task<List<CertProfileDto>> GetAllAsync();

        /// <summary>
        /// Creates a new certificate profile from the given request. <paramref name="tenantId"/> stamps the profile with the owning
        /// tenant so it is fenced to callers with access to that tenant. Pass null for a
        /// system-wide profile (visible to every tenant).
        /// </summary>
        Task<CertProfileDto> CreateAsync(CreateCertProfileRequest request, Guid? tenantId = null);

        /// <summary>
        /// Updates an existing certificate profile by ID.
        /// </summary>
        Task UpdateAsync(Guid id, UpdateCertProfileRequest request);

        /// <summary>
        /// Deletes a certificate profile by ID.
        /// </summary>
        Task DeleteAsync(Guid id);

        /// <summary>
        /// Retrieves a certificate profile by its GUID.
        /// </summary>
        Task<CertProfileDto?> GetByIdAsync(Guid id);

    }
}