using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ModularCA.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddCaUserCeremonyQuorum : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UserCeremonyRequiredApprovals",
                table: "CertificateAuthorities",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UserCeremonyRequiredApprovals",
                table: "CertificateAuthorities");
        }
    }
}
