using ModularCA.Shared.Models.SigningProfiles;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages signing profiles that define algorithm constraints, name constraints,
/// policy OIDs, and allowed cert profile associations.
/// </summary>
public interface ISigningProfileService
{
    /// <summary>
    /// Returns all signing profiles, including their allowed cert profile IDs.
    /// </summary>
    Task<List<SigningProfileDto>> GetAllAsync();

    /// <summary>
    /// Creates a new signing profile and its allowed cert profile links from the given request.
    /// </summary>
    Task<SigningProfileDto> CreateAsync(CreateSigningProfileRequest request);

    /// <summary>
    /// Updates an existing signing profile and its allowed cert profile links by ID.
    /// </summary>
    Task UpdateAsync(Guid id, UpdateSigningProfileRequest request);

    /// <summary>
    /// Deletes a signing profile and its associated cert profile links by ID.
    /// </summary>
    Task DeleteAsync(Guid id);

    /// <summary>
    /// Retrieves a signing profile by its GUID, including allowed cert profile IDs.
    /// </summary>
    Task<SigningProfileDto?> GetByIdAsync(Guid id);

    /// <summary>
    /// Replaces the set of allowed cert profile IDs for a signing profile.
    /// </summary>
    /// <param name="signingProfileId">The signing profile to update.</param>
    /// <param name="certProfileIds">The new set of allowed cert profile IDs.</param>
    Task SetAllowedCertProfilesAsync(Guid signingProfileId, List<Guid> certProfileIds);

    /// <summary>
    /// Returns the list of allowed cert profile IDs for a signing profile.
    /// </summary>
    Task<List<Guid>> GetAllowedCertProfileIdsAsync(Guid signingProfileId);
}
