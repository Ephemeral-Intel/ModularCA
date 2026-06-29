using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ModularCA.Database.Migrations
{
    /// <inheritdoc />
    public partial class RenameCertVulnerabilitiesToComplianceFindings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-preserving rename (CertVulnerabilities -> CertComplianceFindings). The columns
            // are unchanged; only the table and its index names move. The MySQL primary key is the
            // implicit PRIMARY constraint, so no PK rename is required.
            migrationBuilder.RenameTable(
                name: "CertVulnerabilities",
                newName: "CertComplianceFindings");

            migrationBuilder.RenameIndex(
                name: "IX_CertVulnerabilities_CertificateId",
                table: "CertComplianceFindings",
                newName: "IX_CertComplianceFindings_CertificateId");

            migrationBuilder.RenameIndex(
                name: "IX_CertVulnerabilities_CertificateId_Type_IsResolved",
                table: "CertComplianceFindings",
                newName: "IX_CertComplianceFindings_CertificateId_Type_IsResolved");

            migrationBuilder.RenameIndex(
                name: "IX_CertVulnerabilities_IsResolved",
                table: "CertComplianceFindings",
                newName: "IX_CertComplianceFindings_IsResolved");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameIndex(
                name: "IX_CertComplianceFindings_CertificateId",
                table: "CertComplianceFindings",
                newName: "IX_CertVulnerabilities_CertificateId");

            migrationBuilder.RenameIndex(
                name: "IX_CertComplianceFindings_CertificateId_Type_IsResolved",
                table: "CertComplianceFindings",
                newName: "IX_CertVulnerabilities_CertificateId_Type_IsResolved");

            migrationBuilder.RenameIndex(
                name: "IX_CertComplianceFindings_IsResolved",
                table: "CertComplianceFindings",
                newName: "IX_CertVulnerabilities_IsResolved");

            migrationBuilder.RenameTable(
                name: "CertComplianceFindings",
                newName: "CertVulnerabilities");
        }
    }
}
