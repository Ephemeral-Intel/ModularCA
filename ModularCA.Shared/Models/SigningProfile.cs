namespace ModularCA.Shared.Models;

public class SigningProfile
{
    public string Name { get; set; } = "default";
    public string KeyAlgorithm { get; set; } = "RSA";
    public int KeySize { get; set; } = 2048;
    public int ValidityDays { get; set; } = 365;

    public bool IsCA { get; set; } = false;
    public bool IsDefault { get; set; } = false;
}
