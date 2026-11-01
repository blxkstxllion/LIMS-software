using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GbcLims.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCoaResultSnapshotAndNumberSequences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Back ResultsController/CoasController's server-side number generation —
            // replacing the old client-side `Date.now()`-derived schemes, which
            // repeated every ~16.7 minutes. SampleNumber has no equivalent sequence: it
            // records the physical sample's own existing tracking tag, not an
            // internally-invented document number, so it stays operator-entered.
            migrationBuilder.Sql(@"CREATE SEQUENCE IF NOT EXISTS result_analysis_number_seq START WITH 1;");
            migrationBuilder.Sql(@"CREATE SEQUENCE IF NOT EXISTS coa_number_seq START WITH 1;");

            migrationBuilder.AddColumn<decimal>(
                name: "MinorOxides",
                table: "Results",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedAt",
                table: "Coas",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedById",
                table: "Coas",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GeneratedById",
                table: "Coas",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "IssuedAt",
                table: "Coas",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "IssuedById",
                table: "Coas",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ResultId",
                table: "Coas",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotAl2O3",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SnapshotAnalysisDate",
                table: "Coas",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "SnapshotAnalystName",
                table: "Coas",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotAsr",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotFe2O3",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotLoi",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SnapshotMethod",
                table: "Coas",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotRr",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotSiO2",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotTiO2",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SnapshotTotalOxides",
                table: "Coas",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            // Backfill pre-existing COAs (created before this migration, when a COA's
            // result was looked up live on every read instead of frozen at creation) by
            // resolving ResultId/Snapshot* from the most recently-approved Result for
            // the same sample — a one-time version of the same lookup BuildCoaDtoAsync
            // used to do on every request. GeneratedById is best-effort matched by
            // username; left as the zero-guid (no FK constraint on that column) if no
            // match is found, since it's cosmetic attribution for pre-existing records,
            // not something later logic depends on being correct.
            migrationBuilder.Sql(@"
                UPDATE ""Coas"" c
                SET ""ResultId"" = r.""Id"",
                    ""SnapshotAnalystName"" = r.""AnalystName"",
                    ""SnapshotMethod"" = r.""Method"",
                    ""SnapshotAnalysisDate"" = r.""AnalysisDate"",
                    ""SnapshotAl2O3"" = r.""Al2O3"",
                    ""SnapshotSiO2"" = r.""SiO2"",
                    ""SnapshotFe2O3"" = r.""Fe2O3"",
                    ""SnapshotTiO2"" = r.""TiO2"",
                    ""SnapshotLoi"" = r.""Loi"",
                    ""SnapshotTotalOxides"" = r.""TotalOxides"",
                    ""SnapshotAsr"" = r.""Asr"",
                    ""SnapshotRr"" = r.""Rr""
                FROM (
                    SELECT DISTINCT ON (res.""SampleId"") res.*
                    FROM ""Results"" res
                    WHERE res.""Status"" = 3
                    ORDER BY res.""SampleId"", res.""CreatedAt"" DESC
                ) r
                WHERE c.""ResultId"" = '00000000-0000-0000-0000-000000000000'
                  AND r.""SampleId"" = c.""SampleId"";

                UPDATE ""Coas"" c
                SET ""GeneratedById"" = u.""Id""
                FROM ""AspNetUsers"" u
                WHERE u.""UserName"" = c.""GeneratedBy""
                  AND c.""GeneratedById"" = '00000000-0000-0000-0000-000000000000';
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Coas_ApprovedById",
                table: "Coas",
                column: "ApprovedById");

            migrationBuilder.CreateIndex(
                name: "IX_Coas_IssuedById",
                table: "Coas",
                column: "IssuedById");

            migrationBuilder.CreateIndex(
                name: "IX_Coas_ResultId",
                table: "Coas",
                column: "ResultId");

            migrationBuilder.AddForeignKey(
                name: "FK_Coas_AspNetUsers_ApprovedById",
                table: "Coas",
                column: "ApprovedById",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Coas_AspNetUsers_IssuedById",
                table: "Coas",
                column: "IssuedById",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Coas_Results_ResultId",
                table: "Coas",
                column: "ResultId",
                principalTable: "Results",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP SEQUENCE IF EXISTS result_analysis_number_seq;");
            migrationBuilder.Sql(@"DROP SEQUENCE IF EXISTS coa_number_seq;");

            migrationBuilder.DropForeignKey(
                name: "FK_Coas_AspNetUsers_ApprovedById",
                table: "Coas");

            migrationBuilder.DropForeignKey(
                name: "FK_Coas_AspNetUsers_IssuedById",
                table: "Coas");

            migrationBuilder.DropForeignKey(
                name: "FK_Coas_Results_ResultId",
                table: "Coas");

            migrationBuilder.DropIndex(
                name: "IX_Coas_ApprovedById",
                table: "Coas");

            migrationBuilder.DropIndex(
                name: "IX_Coas_IssuedById",
                table: "Coas");

            migrationBuilder.DropIndex(
                name: "IX_Coas_ResultId",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "MinorOxides",
                table: "Results");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "ApprovedById",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "GeneratedById",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "IssuedAt",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "IssuedById",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "ResultId",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotAl2O3",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotAnalysisDate",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotAnalystName",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotAsr",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotFe2O3",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotLoi",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotMethod",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotRr",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotSiO2",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotTiO2",
                table: "Coas");

            migrationBuilder.DropColumn(
                name: "SnapshotTotalOxides",
                table: "Coas");
        }
    }
}
