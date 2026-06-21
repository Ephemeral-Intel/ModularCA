using System.ComponentModel.DataAnnotations;

namespace ModularCA.Auth.Models;

/// <summary>
/// Request model for the pre-JWT password change endpoint used when
/// <see cref="ModularCA.Shared.Entities.UserEntity.PasswordChangeOnNextLogon"/> is set.
/// The user authenticates with their current credentials and provides a new password
/// without needing a JWT token.
/// </summary>
public class PreJwtChangePasswordRequest
{
    /// <summary>The username of the account whose password is being changed.</summary>
    [Required]
    public string Username { get; set; } = string.Empty;

    /// <summary>The user's current (old) password for verification.</summary>
    [Required]
    public string OldPassword { get; set; } = string.Empty;

    /// <summary>The desired new password, which must meet the configured password policy.</summary>
    [Required]
    public string NewPassword { get; set; } = string.Empty;

    /// <summary>Confirmation of the new password; must match <see cref="NewPassword"/>.</summary>
    [Required]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
