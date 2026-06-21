using FluentValidation;
using ModularCA.Shared.Models.CertProfiles;

namespace ModularCA.API.Validation.CertProfiles
{
    public class CreateCertProfileValidator : AbstractValidator<CreateCertProfileRequest>
    {
        private static readonly string[] AllowedKeyUsages =
        {
        "digitalSignature", "keyEncipherment", "dataEncipherment", "keyAgreement",
        "keyCertSign", "crlSign", "encipherOnly", "decipherOnly"
    };

        private static readonly string[] AllowedExtendedKeyUsages =
        {
        "serverAuth", "clientAuth", "codeSigning", "emailProtection",
        "timeStamping", "OCSPSigning", "smartcardLogon"
    };

        public CreateCertProfileValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Name is required.")
                .MaximumLength(100);

            RuleFor(x => x.Description)
                .MaximumLength(255);

            RuleFor(x => x.KeyUsages)
                .NotEmpty()
                .Must(BeValidKeyUsages)
                .WithMessage($"KeyUsages must be a comma-separated list of: {string.Join(", ", AllowedKeyUsages)}");

            RuleFor(x => x.ExtendedKeyUsages)
                .Must(BeValidEKUs)
                .When(x => !string.IsNullOrEmpty(x.ExtendedKeyUsages))
                .WithMessage($"ExtendedKeyUsages must be a comma-separated list of: {string.Join(", ", AllowedExtendedKeyUsages)}");

            RuleFor(x => x.ValidityPeriodMax)
                .NotEmpty()
                .Matches(@"^P(\d+Y)?(\d+M)?(\d+D)?$")
                .WithMessage("ValidityPeriodMax must be an ISO 8601 duration like P1Y, P6M, or P90D.");
        }

        private bool BeValidKeyUsages(string input) =>
            input.Split(',', StringSplitOptions.RemoveEmptyEntries)
                 .Select(x => x.Trim())
                 .All(x => AllowedKeyUsages.Contains(x));

        private bool BeValidEKUs(string input) =>
            input.Split(',', StringSplitOptions.RemoveEmptyEntries)
                 .Select(x => x.Trim())
                 .All(x => AllowedExtendedKeyUsages.Contains(x));
    }

}
