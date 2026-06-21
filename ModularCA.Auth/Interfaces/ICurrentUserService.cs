using ModularCA.Shared.Entities;

namespace ModularCA.Auth.Interfaces
{
    /// <summary>
    /// Provides access to the currently authenticated user's identity and entity,
    /// resolved from the JWT claims in the HTTP context.
    /// </summary>
    public interface ICurrentUserService
    {
        /// <summary>The authenticated user's ID parsed from the JWT sub claim, or null.</summary>
        Guid? UserId { get; }

        /// <summary>The loaded user entity with group memberships. Call <see cref="EnsureLoadedAsync"/> first.</summary>
        UserEntity? User { get; }

        /// <summary>True if a valid user ID could be extracted from the current request.</summary>
        bool IsAuthenticated { get; }

        /// <summary>Loads the full user entity from the database if not already loaded.</summary>
        Task EnsureLoadedAsync();
    }
}
