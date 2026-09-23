using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <inheritdoc />
    public partial class CatalogObjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CatalogObjects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Code = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    NormalizedCode = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogObjects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CatalogObjectLinks",
                columns: table => new
                {
                    ParentId = table.Column<int>(type: "INTEGER", nullable: false),
                    ChildId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogObjectLinks", x => new { x.ParentId, x.ChildId });
                    table.CheckConstraint("CK_CatalogObjectLinks_ParentIsNotChild", "\"ParentId\" <> \"ChildId\"");
                    table.ForeignKey(
                        name: "FK_CatalogObjectLinks_CatalogObjects_ChildId",
                        column: x => x.ChildId,
                        principalTable: "CatalogObjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CatalogObjectLinks_CatalogObjects_ParentId",
                        column: x => x.ParentId,
                        principalTable: "CatalogObjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CatalogObjectLinks_ChildId",
                table: "CatalogObjectLinks",
                column: "ChildId");

            migrationBuilder.CreateIndex(
                name: "IX_CatalogObjects_NormalizedCode",
                table: "CatalogObjects",
                column: "NormalizedCode",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogObjectLinks");

            migrationBuilder.DropTable(
                name: "CatalogObjects");
        }
    }
}
