using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models.Management
{
    /// <summary>
    /// Request body for updating an existing user account's profile fields.
    /// Nullable fields are treated as "no change" when omitted from the request.
    /// </summary>
    public class UpdateUserRequest
    {
        [MaxLength(255)]
        public string? Username { get; set; }

        [MaxLength(255)]
        public string? Email { get; set; }

        [MaxLength(256)]
        public string? Password { get; set; }

        [MaxLength(255)]
        public string? FirstName { get; set; }

        /// <summary>
        /// When true, exempts the account from password-age expiration policy. Null means
        /// leave the current value unchanged. Aligned with <c>CreateUserRequest.PasswordNeverExpires</c>
        /// so System.Text.Json deserializes the UI's <c>true</c>/<c>false</c> literal directly.
        /// </summary>
        public bool? PasswordNeverExpires { get; set; }
        public bool? PasswordChangeOnNextLogon { get; set; }

        [MaxLength(255)]
        public string? LastName { get; set; }

        [MaxLength(255)]
        public string? DisplayName { get; set; }

        public bool? IsActive { get; set; } = true;
        public bool? IsLocked { get; set; } = false;
    }
}
