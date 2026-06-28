using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ModularCA.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddRefreshTokenCnfJkt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CnfJkt",
                table: "RefreshTokens",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CnfJkt",
                table: "RefreshTokens");
        }
    }
}
