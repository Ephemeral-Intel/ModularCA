using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models.Management
{
    /// <summary>
    /// Request body for creating a new user account.
    /// </summary>
    public class CreateUserRequest
    {
        [Required, MaxLength(255)]
        public string Username { get; set; } = string.Empty;

        [Required, MaxLength(255)]
        public string Email { get; set; } = string.Empty;

        [Required, MaxLength(256)]
        public string Password { get; set; } = string.Empty;

        [Required, MaxLength(255)]
        public string FirstName { get; set; } = string.Empty;

        public bool? PasswordNeverExpires { get; set; } = false;
        public bool? PasswordChangeOnNextLogon { get; set; } = false;

        [Required, MaxLength(255)]
        public string LastName { get; set; } = string.Empty;

        [MaxLength(255)]
        public string? DisplayName { get; set; } = string.Empty;

        /// <summary>List of group IDs to assign the new user to.</summary>
        public List<Guid>? GroupIds { get; set; }
        public bool? IsActive { get; set; } = true;
        public bool? IsLocked { get; set; } = false;
    }
}
