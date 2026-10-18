using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Układ zwinięć drzewa (plan <c>zwijanie-drzewa</c>): kolumna
    /// <c>IsCollapsed</c> w <c>TreeNodes</c> z wartością domyślną <c>false</c>,
    /// więc istniejące drzewa — także wzorzec — zostają rozwinięte jak dotąd.
    /// Bez zmian danych; <c>ADD COLUMN</c> nie przebudowuje tabeli.
    /// </summary>
    public partial class TreeNodeCollapsed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsCollapsed",
                table: "TreeNodes",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsCollapsed",
                table: "TreeNodes");
        }
    }
}
