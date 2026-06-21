using FluentValidation;
using ModularCA.Shared.Models.CertProfiles;

namespace ModularCA.API.Validation.CertProfiles
{
    public class UpdateCertProfileValidator : AbstractValidator<UpdateCertProfileRequest>
    {
        public UpdateCertProfileValidator()
        {
            Include(new CreateCertProfileValidator());
        }
    }
}