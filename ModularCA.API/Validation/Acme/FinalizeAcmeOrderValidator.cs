using FluentValidation;
using ModularCA.Shared.Models.Acme;

namespace ModularCA.API.Validation.Acme;

public class FinalizeAcmeOrderValidator : AbstractValidator<FinalizeAcmeOrderRequest>
{
    public FinalizeAcmeOrderValidator()
    {
        RuleFor(x => x.Csr)
            .NotEmpty().WithMessage("CSR is required.")
            .Must(BeValidBase64Url).WithMessage("CSR must be a valid base64url-encoded value.");
    }

    private static bool BeValidBase64Url(string csr)
    {
        if (string.IsNullOrWhiteSpace(csr))
            return false;

        // Base64url uses only [A-Za-z0-9_-] with no padding
        return csr.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_');
    }
}
