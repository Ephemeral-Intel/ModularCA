using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ModularCA.Database.Migrations.Audit
{
    /// <inheritdoc />
    public partial class RenameCertVulnerabilitiesToComplianceFindings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-preserving rename (CertVulnerabilities -> CertComplianceFindings) in the audit
            // database. Columns are unchanged; the audit copy carries only the implicit PRIMARY key
            // (no secondary indexes), so a single table rename is sufficient.
            migrationBuilder.RenameTable(
                name: "CertVulnerabilities",
                newName: "CertComplianceFindings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(
                name: "CertComplianceFindings",
                newName: "CertVulnerabilities");
        }
    }
}
