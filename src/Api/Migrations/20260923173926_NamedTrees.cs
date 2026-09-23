using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Nazwane drzewa: węzły przestają należeć wprost do konta i należą do
    /// drzewa (<c>Trees</c>), a drzewo do konta. Drzewo robocze każdego konta,
    /// które ma węzły, staje się jego pierwszym nazwanym drzewem „Drzewo
    /// robocze" z nietkniętą strukturą.
    /// </summary>
    /// <remarks>
    /// Migracja jest ułożona ręcznie. Wygenerowana zdejmowała <c>UserId</c>
    /// i dodawała wymagane <c>TreeId</c> z wartością domyślną 0, czyli gubiła
    /// właściciela każdego węzła. EF na SQLite zostawia <c>Sql()</c> na swoim
    /// miejscu, a operacje wymagające przebudowy tabeli (klucze obce, zmiana
    /// wymagalności, zdjęcie kolumny) zbiera w jedną przebudowę na końcu
    /// migracji — kolejność sprawdza się w skrypcie
    /// (<c>dotnet ef migrations script</c>), nie w tym pliku.
    ///
    /// Nazwa drzewa i jej postać znormalizowana są tu literałami, a nie stałymi
    /// z kodu: migracja ma zostać taka, jaka była w chwili wydania, nawet gdy
    /// reguła nazwy się kiedyś zmieni.
    /// </remarks>
    public partial class NamedTrees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Trees",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Trees", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Trees_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Trees_UserId_NormalizedName",
                table: "Trees",
                columns: new[] { "UserId", "NormalizedName" },
                unique: true);

            // Najpierw nullowalna — zwykłe `ADD COLUMN`, bez przebudowy. Wymagana
            // staje się dopiero w przebudowie niżej, po wypełnieniu.
            migrationBuilder.AddColumn<int>(
                name: "TreeId",
                table: "TreeNodes",
                type: "INTEGER",
                nullable: true);

            // Jedno drzewo na każde konto, które ma węzły. Konto bez węzłów
            // drzewa nie dostaje — widok pokaże mu zachętę do dodania pierwszego.
            migrationBuilder.Sql(
                """
                INSERT INTO "Trees" ("UserId", "Name", "NormalizedName")
                SELECT DISTINCT "UserId", 'Drzewo robocze', 'DRZEWO ROBOCZE'
                FROM "TreeNodes";
                """);

            // Konto ma w tej chwili dokładnie jedno drzewo, więc drzewo
            // właściciela jest jednoznaczne.
            migrationBuilder.Sql(
                """
                UPDATE "TreeNodes"
                SET "TreeId" = (
                    SELECT "Trees"."Id"
                    FROM "Trees"
                    WHERE "Trees"."UserId" = "TreeNodes"."UserId");
                """);

            // Dalej wyłącznie zmiany schematu, które EF na SQLite realizuje
            // przebudową tabeli `TreeNodes` — ta kopiuje wiersze z już
            // wypełnionym `TreeId`, a węzeł bez drzewa zatrzymałby ją na
            // `NOT NULL`, zamiast przejść po cichu.
            migrationBuilder.DropForeignKey(
                name: "FK_TreeNodes_AspNetUsers_UserId",
                table: "TreeNodes");

            migrationBuilder.DropIndex(
                name: "IX_TreeNodes_UserId_ParentId_Position",
                table: "TreeNodes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "TreeNodes");

            migrationBuilder.AlterColumn<int>(
                name: "TreeId",
                table: "TreeNodes",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TreeNodes_TreeId_ParentId_Position",
                table: "TreeNodes",
                columns: new[] { "TreeId", "ParentId", "Position" });

            migrationBuilder.AddForeignKey(
                name: "FK_TreeNodes_Trees_TreeId",
                table: "TreeNodes",
                column: "TreeId",
                principalTable: "Trees",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <summary>
        /// Cofa węzły do właściciela-konta. Drzewa jednego konta zostają przy
        /// tym scalone w jedno drzewo robocze — podziału na nazwane drzewa nie da
        /// się przywrócić, bo stary model go nie ma. Najwyższe poziomy
        /// scalonych drzew lądują w jednej grupie rodzeństwa, więc mogą w niej
        /// wystąpić powtórzone pozycje i ten sam obiekt dwa razy; nazwy drzew
        /// przepadają.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "TreeNodes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "TreeNodes"
                SET "UserId" = (
                    SELECT "Trees"."UserId"
                    FROM "Trees"
                    WHERE "Trees"."Id" = "TreeNodes"."TreeId");
                """);

            // Musi stać przed usunięciem tabeli drzew i poza transakcją (w
            // transakcji ta instrukcja nic nie robi). EF dokłada przebudowę
            // `TreeNodes` na koniec migracji, więc `DROP TABLE "Trees"` idzie,
            // gdy węzły wciąż mają do drzew klucz obcy z `ON DELETE CASCADE` —
            // a `DROP TABLE` przy włączonych kluczach obcych najpierw usuwa
            // wiersze i odpala kaskadę, czyli skasowałby wszystkie węzły.
            // Klucze obce włącza z powrotem sama przebudowa
            // (`PRAGMA foreign_keys = 1` na jej końcu).
            migrationBuilder.Sql("PRAGMA foreign_keys = 0;", suppressTransaction: true);

            migrationBuilder.DropTable(
                name: "Trees");

            migrationBuilder.DropForeignKey(
                name: "FK_TreeNodes_Trees_TreeId",
                table: "TreeNodes");

            migrationBuilder.DropIndex(
                name: "IX_TreeNodes_TreeId_ParentId_Position",
                table: "TreeNodes");

            migrationBuilder.DropColumn(
                name: "TreeId",
                table: "TreeNodes");

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "TreeNodes",
                type: "TEXT",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TreeNodes_UserId_ParentId_Position",
                table: "TreeNodes",
                columns: new[] { "UserId", "ParentId", "Position" });

            migrationBuilder.AddForeignKey(
                name: "FK_TreeNodes_AspNetUsers_UserId",
                table: "TreeNodes",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
