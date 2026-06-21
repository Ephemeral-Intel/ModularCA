using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models.Management
{
    /// <summary>
    /// Request body for changing a user's password.
    /// </summary>
    public class UpdatePasswordRequest
    {
        [Required, MaxLength(256)]
        public string OldPassword { get; set; } = string.Empty;

        [Required, MaxLength(256)]
        public string NewPassword { get; set; } = string.Empty;

        [Required, MaxLength(256)]
        public string ConfirmNewPassword { get; set; } = string.Empty;
    }
}
