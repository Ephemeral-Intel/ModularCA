using ModularCA.Shared.Enums;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities
{
    [Table("CertificateAccess")]
    public class CertificateAccessListEntity
    {
        [Key]
        public Guid Id { get; set; }

        [Required]
        public Guid CertificateId { get; set; }

        [ForeignKey("CertificateId")]
        public virtual CertificateEntity Certificate { get; set; } = default!;

        [Required]
        public Guid UserId { get; set; }

        [ForeignKey("UserId")]
        public virtual UserEntity User { get; set; } = default!;

        [Required]
        public CertificateAccessLevel AccessLevel { get; set; }

        public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

        public Guid? GrantedByUserId { get; set; }

        [ForeignKey("GrantedByUserId")]
        public virtual UserEntity? GrantedByUser { get; set; }
    }
}
