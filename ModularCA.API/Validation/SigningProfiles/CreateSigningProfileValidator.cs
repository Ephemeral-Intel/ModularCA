using FluentValidation;
using ModularCA.Shared.Models.SigningProfiles;

namespace ModularCA.API.Validation.SigningProfiles
{
    public class CreateSigningProfileValidator : AbstractValidator<CreateSigningProfileRequest>
    {
        public CreateSigningProfileValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Name is required.")
                .MaximumLength(100);

            RuleFor(x => x.Description)
                .MaximumLength(255);

            RuleFor(x => x.IssuerId)
                .NotEmpty().WithMessage("IssuerId (CA certificate) is required.");

            RuleFor(x => x.IsDefault)
                .NotNull();
        }
    }
}
