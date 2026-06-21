using ModularCA.Core.Models;

namespace ModularCA.Core.Services;

/// <summary>
/// Resolves effective profile values by merging CA-scoped profiles with their
/// inherited parent profiles. Child overrides must be equal or stricter than parent constraints.
/// </summary>
public interface IProfileResolutionService
{
    /// <summary>
    /// Resolves the effective cert profile by merging with parent if inheritance is enabled.
    /// </summary>
    /// <param name="certProfileId">The ID of the cert profile to resolve.</param>
    /// <returns>The merged effective cert profile with field-source traceability.</returns>
    Task<EffectiveCertProfile> ResolveCertProfileAsync(Guid certProfileId);

    /// <summary>
    /// Resolves the effective request profile by merging with parent if inheritance is enabled.
    /// </summary>
    /// <param name="requestProfileId">The ID of the request profile to resolve.</param>
    /// <returns>The merged effective request profile with field-source traceability.</returns>
    Task<EffectiveRequestProfile> ResolveRequestProfileAsync(Guid requestProfileId);

    /// <summary>
    /// Validates that a child cert profile's overrides don't violate the parent's constraints.
    /// Returns a list of validation errors (empty = valid).
    /// </summary>
    /// <param name="childProfileId">The ID of the child cert profile to validate.</param>
    /// <returns>A list of validation error messages; empty if the inheritance is valid.</returns>
    Task<List<string>> ValidateCertProfileInheritanceAsync(Guid childProfileId);

    /// <summary>
    /// Validates that a child request profile's overrides don't violate the parent's constraints.
    /// Returns a list of validation errors (empty = valid).
    /// </summary>
    /// <param name="childProfileId">The ID of the child request profile to validate.</param>
    /// <returns>A list of validation error messages; empty if the inheritance is valid.</returns>
    Task<List<string>> ValidateRequestProfileInheritanceAsync(Guid childProfileId);
}
