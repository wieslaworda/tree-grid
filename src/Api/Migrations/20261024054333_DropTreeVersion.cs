using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Zdjęcie osieroconej kolumny <c>Trees.Version</c> (impl-review
    /// <c>budowa-drzewa</c> F2): dodała ją <c>TreeVersion</c> dla zapisu
    /// całości z fazy 6, którą wyłączono z planu 2026-10-24; model jej nie zna
    /// i nic jej nie czyta. Surowe <c>ALTER TABLE … DROP COLUMN</c> zamiast
    /// <c>DropColumn</c>: provider SQLite zrobiłby z tego przebudowę
    /// <c>Trees</c>, a kolumna nie ma indeksu ani klucza, więc SQLite zdejmuje
    /// ją w miejscu.
    /// </summary>
    public partial class DropTreeVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"Trees\" DROP COLUMN \"Version\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"Trees\" ADD COLUMN \"Version\" INTEGER NOT NULL DEFAULT 1;");
        }
    }
}
