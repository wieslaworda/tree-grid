using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Nazwane ekrany użytkownika (S-06): tabela <c>Screens</c> z właścicielem,
    /// wskazanym drzewem (klucz obcy z <c>Restrict</c>) i ziarnem, lista
    /// kategorii domyślnych <c>ScreenDefaultCategories</c> oraz przypisania
    /// kategorii do węzłów <c>ScreenNodeCategories</c>, obie z kaskadą od
    /// ekranu, kategorii i — przypisania — od węzła. Trzy nowe tabele, bez
    /// zmian w istniejących i bez przekształcania danych; osieroconej kolumny
    /// <c>Trees.Version</c> migracja nie dotyka.
    /// </summary>
    public partial class Screens : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Screens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    TreeId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    GrainMinutes = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Screens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Screens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Screens_Trees_TreeId",
                        column: x => x.TreeId,
                        principalTable: "Trees",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ScreenDefaultCategories",
                columns: table => new
                {
                    ScreenId = table.Column<int>(type: "INTEGER", nullable: false),
                    CategoryId = table.Column<int>(type: "INTEGER", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScreenDefaultCategories", x => new { x.ScreenId, x.CategoryId });
                    table.ForeignKey(
                        name: "FK_ScreenDefaultCategories_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ScreenDefaultCategories_Screens_ScreenId",
                        column: x => x.ScreenId,
                        principalTable: "Screens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ScreenNodeCategories",
                columns: table => new
                {
                    ScreenId = table.Column<int>(type: "INTEGER", nullable: false),
                    TreeNodeId = table.Column<int>(type: "INTEGER", nullable: false),
                    CategoryId = table.Column<int>(type: "INTEGER", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScreenNodeCategories", x => new { x.ScreenId, x.TreeNodeId, x.CategoryId });
                    table.ForeignKey(
                        name: "FK_ScreenNodeCategories_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ScreenNodeCategories_Screens_ScreenId",
                        column: x => x.ScreenId,
                        principalTable: "Screens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ScreenNodeCategories_TreeNodes_TreeNodeId",
                        column: x => x.TreeNodeId,
                        principalTable: "TreeNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ScreenDefaultCategories_CategoryId",
                table: "ScreenDefaultCategories",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_ScreenNodeCategories_CategoryId",
                table: "ScreenNodeCategories",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_ScreenNodeCategories_TreeNodeId",
                table: "ScreenNodeCategories",
                column: "TreeNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_Screens_TreeId",
                table: "Screens",
                column: "TreeId");

            migrationBuilder.CreateIndex(
                name: "IX_Screens_UserId_NormalizedName",
                table: "Screens",
                columns: new[] { "UserId", "NormalizedName" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ScreenDefaultCategories");

            migrationBuilder.DropTable(
                name: "ScreenNodeCategories");

            migrationBuilder.DropTable(
                name: "Screens");
        }
    }
}
