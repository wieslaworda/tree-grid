using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Usunięcie relacji rodzic–podobiekt ze słownika obiektów: obiekt to
    /// odtąd wyłącznie kod i nazwa, a strukturę składa użytkownik w drzewie.
    /// Zapisane relacje giną bezpowrotnie. Drzew to nie rusza — gałęzie
    /// dołączone wcześniej ze słownika są w <c>TreeNodes</c> osobnymi węzłami,
    /// bez odwołania do tej tabeli.
    /// </summary>
    public partial class RemoveCatalogObjectLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogObjectLinks");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
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
        }
    }
}
