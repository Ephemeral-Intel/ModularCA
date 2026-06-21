namespace ModularCA.Auth.Models
{
    public class LoginResponse
    {
        public string Token { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
        public string RefreshToken { get; set; } = string.Empty;

        /// <summary>
        /// When true, the user must complete MFA enrollment before accessing admin functionality.
        /// The issued JWT contains a restricted <c>mfa_setup_required</c> claim.
        /// </summary>
        public bool? MfaSetupRequired { get; set; }

        /// <summary>
        /// When true, the user only has mTLS configured for MFA and should be prompted to
        /// also set up TOTP or WebAuthn for step-up verification of destructive operations.
        /// </summary>
        public bool? MtlsOnlyWarning { get; set; }
    }
}
