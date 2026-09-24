using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Licznik wersji drzewa (<c>Trees.Version</c>): zapis całości porównuje
    /// go z wersją szkicu i odrzuca zapis na starszym stanie. Istniejące drzewa
    /// dostają wartość domyślną 1, bez przekształcania danych — na SQLite to
    /// zwykłe <c>ALTER TABLE … ADD COLUMN</c>, bez przebudowy tabeli.
    /// </summary>
    public partial class TreeVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Trees",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Version",
                table: "Trees");
        }
    }
}
