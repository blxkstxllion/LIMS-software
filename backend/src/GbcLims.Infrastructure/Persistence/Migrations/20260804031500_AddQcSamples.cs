using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GbcLims.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQcSamples : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QcSamples",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QcNumber = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    ReferenceSampleId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExpectedAl2O3 = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    ActualAl2O3 = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Variance = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QcSamples", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QcSamples_AspNetUsers_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QcSamples_Samples_ReferenceSampleId",
                        column: x => x.ReferenceSampleId,
                        principalTable: "Samples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QcSamples_CreatedById",
                table: "QcSamples",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_QcSamples_QcNumber",
                table: "QcSamples",
                column: "QcNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QcSamples_ReferenceSampleId",
                table: "QcSamples",
                column: "ReferenceSampleId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QcSamples");
        }
    }
}
