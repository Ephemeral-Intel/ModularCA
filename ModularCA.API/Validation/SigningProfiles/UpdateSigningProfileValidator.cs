using FluentValidation;
using ModularCA.Shared.Models.SigningProfiles;

namespace ModularCA.API.Validation.SigningProfiles
{
    public class UpdateSigningProfileValidator : AbstractValidator<UpdateSigningProfileRequest>
    {
        public UpdateSigningProfileValidator()
        {
            Include(new CreateSigningProfileValidator());
        }
    }
}