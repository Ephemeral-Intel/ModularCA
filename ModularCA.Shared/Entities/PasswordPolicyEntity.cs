using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("PasswordPolicy")]
public class PasswordPolicyEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public int MinLength { get; set; } = 12;
    public int MaxLength { get; set; } = 128;
    public bool RequireUppercase { get; set; } = true;
    public bool RequireLowercase { get; set; } = true;
    public bool RequireDigit { get; set; } = true;
    public bool RequireSymbol { get; set; } = true;
    public int MinUppercase { get; set; } = 0;
    public int MinLowercase { get; set; } = 0;
    public int MinDigits { get; set; } = 0;
    public int MinSpecial { get; set; } = 0;
    public int MaxAgeDays { get; set; } = 90;
    public int HistoryCount { get; set; } = 0;

    [MaxLength(500)]
    public string? DictionaryPath { get; set; }
    public bool DictionaryIsHashed { get; set; } = false;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
