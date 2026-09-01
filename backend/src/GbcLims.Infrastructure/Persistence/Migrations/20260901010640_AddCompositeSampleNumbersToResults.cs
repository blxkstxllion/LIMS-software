using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GbcLims.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCompositeSampleNumbersToResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdditionalSampleNumbers",
                table: "Results",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdditionalSampleNumbers",
                table: "Results");
        }
    }
}
