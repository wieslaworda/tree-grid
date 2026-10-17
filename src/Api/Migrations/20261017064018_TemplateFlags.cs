using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <summary>
    /// Wzorzec ekranu (plan <c>drzewo-domyslne</c>): kolumna <c>IsTemplate</c>
    /// w <c>Trees</c> i <c>Screens</c>, po jednym częściowym unikalnym indeksie
    /// na każdą (najwyżej jeden wzorzec drzewa i jeden ekranu w bazie), a potem
    /// oznaczenie istniejącego wzorca w bazie, która go ma. W bazie bez wzorca
    /// (testy, E2E, świeża instalacja) oba <c>UPDATE</c> nic nie zmieniają.
    /// </summary>
    /// <remarks>
    /// Schemat zmienia się wyłącznie przez <c>ADD COLUMN</c> i
    /// <c>CREATE INDEX</c> — bez przebudowy tabeli. Przebudowa <c>Trees</c>
    /// kopiuje tylko kolumny modelu, więc po cichu usunęłaby osieroconą
    /// kolumnę <c>Trees.Version</c>, która istnieje fizycznie w bazach sprzed
    /// migracji <c>Screens</c>, ale nie w modelu.
    ///
    /// Ekran wzorca jest wybierany po nazwie, bo nazwa jest jedyną cechą,
    /// która go wskazuje w każdej bazie — identyfikatory różnią się między
    /// kopiami bazy. Nazwa ekranu nie jest unikalna globalnie (tylko w obrębie
    /// konta), więc przy kilku trafieniach wygrywa najniższe <c>Id</c>, czyli
    /// najstarszy ekran. Drzewo wzorca to drzewo wskazywane przez ten ekran,
    /// a nie drzewo wybrane po własnej nazwie: klon wymaga, żeby oba wzorce
    /// były ze sobą spięte (<c>Screen.TreeId == Tree.Id</c>), a drzewo
    /// o tej samej nazwie mogłoby należeć do innego konta albo nie być drzewem
    /// tego ekranu. Nazwa jest literałem, a nie stałą z kodu — z tego samego
    /// powodu co w <c>NamedTrees</c>: migracja ma zostać taka, jaka była
    /// w chwili wydania.
    /// </remarks>
    public partial class TemplateFlags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsTemplate",
                table: "Trees",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsTemplate",
                table: "Screens",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Trees_IsTemplate",
                table: "Trees",
                column: "IsTemplate",
                unique: true,
                filter: "\"IsTemplate\" = 1");

            migrationBuilder.CreateIndex(
                name: "IX_Screens_IsTemplate",
                table: "Screens",
                column: "IsTemplate",
                unique: true,
                filter: "\"IsTemplate\" = 1");

            // Dane dopiero po indeksach: każde `UPDATE` oznacza najwyżej jeden
            // wiersz, więc indeks unikalny przejdzie, a podzapytanie drzewa
            // dostaje co najwyżej jeden ekran wzorca.
            migrationBuilder.Sql(
                """
                UPDATE "Screens" SET "IsTemplate" = 1
                WHERE "Id" = (SELECT MIN("Id") FROM "Screens" WHERE "Name" = 'Testowy ekran prezentacyjny');
                """);

            // Drzewo z ekranu wzorca, nie z nazwy — powód w `<remarks>` klasy.
            migrationBuilder.Sql(
                """
                UPDATE "Trees" SET "IsTemplate" = 1
                WHERE "Id" = (SELECT "TreeId" FROM "Screens" WHERE "IsTemplate" = 1);
                """);
        }

        /// <summary>
        /// Zdejmuje indeksy i kolumny wzorca; oznaczenie wzorca przepada.
        /// </summary>
        /// <remarks>
        /// Nie uruchamiać na bazie deweloperskiej <c>src/Api/db/treegrid.db</c>
        /// — tylko na kopii. SQLite usuwa kolumnę przebudową tabeli
        /// <c>Trees</c>, która kopiuje wyłącznie kolumny modelu, więc razem
        /// z <c>IsTemplate</c> po cichu zniknie też osierocona kolumna
        /// <c>Trees.Version</c> (zob. <c>Screens</c>, <c>TreeVersion</c>).
        /// </remarks>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Trees_IsTemplate",
                table: "Trees");

            migrationBuilder.DropIndex(
                name: "IX_Screens_IsTemplate",
                table: "Screens");

            migrationBuilder.DropColumn(
                name: "IsTemplate",
                table: "Trees");

            migrationBuilder.DropColumn(
                name: "IsTemplate",
                table: "Screens");
        }
    }
}
