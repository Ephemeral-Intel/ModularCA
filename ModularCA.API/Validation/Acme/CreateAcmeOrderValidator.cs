using FluentValidation;
using ModularCA.Shared.Models.Acme;

namespace ModularCA.API.Validation.Acme;

public class CreateAcmeOrderValidator : AbstractValidator<CreateAcmeOrderRequest>
{
    public CreateAcmeOrderValidator()
    {
        RuleFor(x => x.Identifiers)
            .NotEmpty().WithMessage("At least one identifier is required.");

        RuleForEach(x => x.Identifiers).ChildRules(identifier =>
        {
            identifier.RuleFor(i => i.Type)
                .NotEmpty().WithMessage("Identifier type is required.")
                .Must(t => t == "dns")
                .WithMessage("Only 'dns' identifier type is supported.");

            identifier.RuleFor(i => i.Value)
                .NotEmpty().WithMessage("Identifier value is required.")
                .MaximumLength(253).WithMessage("Domain name must not exceed 253 characters.");
        });

        RuleFor(x => x.NotBefore)
            .Must(nb => nb == null || nb > DateTime.UtcNow.AddMinutes(-5))
            .WithMessage("NotBefore must not be in the past.");

        RuleFor(x => x.NotAfter)
            .Must(na => na == null || na > DateTime.UtcNow)
            .WithMessage("NotAfter must be in the future.")
            .Must((request, na) => na == null || request.NotBefore == null || na > request.NotBefore)
            .WithMessage("NotAfter must be after NotBefore.");
    }
}
