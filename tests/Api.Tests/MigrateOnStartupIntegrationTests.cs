using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Api.Tests;

/// <summary>
/// Trzecia ścieżka migracji przy starcie (plan
/// <c>context/changes/hosting-monsterasp/plan.md</c>, Faza 3): poza Development
/// z flagą <c>Database:MigrateOnStartup</c> = <c>true</c> start robi kopię
/// pliku bazy (<c>&lt;plik&gt;.pre-&lt;ostatnia oczekująca migracja&gt;.bak</c>)
/// i migruje, bez flagi odmawia startu jak dotąd, a na aktualnej bazie
/// niczego nie kopiuje.
///
/// Każdy test ma własny host i własny plik bazy, bo sprawdza sam start hosta.
/// Host biegnie w środowisku <c>Testing</c> (<see cref="TestApiFactory"/>),
/// czyli poza Development, z kompletem sekretów fabryki — odmowa może więc
/// pochodzić wyłącznie z oczekujących migracji.
///
/// Odmowę startu widać po trzech rzeczach naraz: aplikacja nigdy nie zgłosiła
/// <c>ApplicationStarted</c> (<c>Program</c> zwrócił 1 przed <c>app.Run()</c>,
/// a fabryka kończy wtedy start bez wyjątku), w pliku logu jest wpis krytyczny
/// odmowy, a schemat dalej czeka na migracje.
/// </summary>
public class MigrateOnStartupIntegrationTests
{
    /// <summary>Klucz flagi — wpisany literałem, wyrocznią jest plan.</summary>
    private const string MigrateOnStartupKey = "Database:MigrateOnStartup";

    /// <summary>Fragment komunikatu odmowy startu na niezmigrowanej bazie.</summary>
    private const string RefusalMessage = "Baza danych nie jest zmigrowana";

    [Fact]
    public async Task Empty_database_with_the_flag_is_backed_up_and_migrated_and_the_api_starts()
    {
        await using var factory = new StartupApiFactory(migrateDatabase: false, migrateOnStartup: "true");

        Assert.True(HasStarted(factory), "Host z flagą migracji nie wystartował.");

        string lastMigration;

        await using (factory.CreateDbScope(out var db))
        {
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            lastMigration = db.Database.GetMigrations().Last();
        }

        var backup = Assert.Single(factory.FindBackupFiles());
        Assert.Equal($"{factory.DatabasePath}.pre-{lastMigration}.bak", backup);

        // Kopia jest obrazem bazy sprzed migracji, a nie po niej.
        Assert.False(HasMigrationsHistory(backup), "Kopia powstała po migracji, a nie przed nią.");

        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    [Theory]
    [InlineData("false")]
    [InlineData(null)]
    public async Task Empty_database_without_the_flag_refuses_to_start_and_is_left_untouched(string? migrateOnStartup)
    {
        await using var factory = new StartupApiFactory(migrateDatabase: false, migrateOnStartup);

        Assert.False(HasStarted(factory), "Host bez flagi wystartował na niezmigrowanej bazie.");

        await using (factory.CreateDbScope(out var db))
        {
            Assert.NotEmpty(await db.Database.GetPendingMigrationsAsync());
        }

        Assert.Empty(factory.FindBackupFiles());
        Assert.Contains(RefusalMessage, ReadLog(factory));
    }

    [Fact]
    public async Task Current_database_with_the_flag_starts_without_a_backup()
    {
        await using var factory = new StartupApiFactory(migrateDatabase: true, migrateOnStartup: "true");

        Assert.True(HasStarted(factory), "Host z flagą nie wystartował na aktualnej bazie.");
        Assert.Empty(factory.FindBackupFiles());

        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// Czy aplikacja doszła do <c>app.Run()</c>. Odczyt <c>Services</c> podnosi
    /// host fabryki, a ta czeka albo na <c>ApplicationStarted</c>, albo na koniec
    /// <c>Program</c> — po powrocie stan jest więc rozstrzygnięty.
    /// </summary>
    private static bool HasStarted(TestApiFactory factory)
        => factory.Services
            .GetRequiredService<IHostApplicationLifetime>()
            .ApplicationStarted
            .IsCancellationRequested;

    /// <summary>
    /// Czy plik bazy ma tabelę historii migracji EF Core. Połączenie tylko do
    /// odczytu i bez puli, żeby nie trzymało uchwytu, gdy fabryka sprząta pliki.
    /// </summary>
    private static bool HasMigrationsHistory(string databasePath)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false,
        }.ToString();

        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__EFMigrationsHistory';";

        return Convert.ToInt64(command.ExecuteScalar()) > 0;
    }

    /// <summary>
    /// Treść wszystkich plików <c>api-*.log</c> fabryki. Odczyt z
    /// <see cref="FileShare.ReadWrite"/>, jak w <c>FileLoggingIntegrationTests</c>.
    /// </summary>
    private static string ReadLog(TestApiFactory factory)
    {
        Assert.True(
            Directory.Exists(factory.LogDirectory),
            $"Katalog logu '{factory.LogDirectory}' nie powstał.");

        var content = new StringBuilder();

        foreach (var file in Directory.GetFiles(factory.LogDirectory, "api-*.log").Order())
        {
            using var stream = new FileStream(
                file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            content.Append(reader.ReadToEnd());
        }

        return content.ToString();
    }

    /// <summary>
    /// Host na pliku bazy bez schematu albo ze schematem i z flagą migracji
    /// przy starcie ustawioną na podaną wartość (<c>null</c> — klucza brak,
    /// obowiązuje domyślne <c>false</c>).
    /// </summary>
    private sealed class StartupApiFactory(bool migrateDatabase, string? migrateOnStartup)
        : TestApiFactory(migrateDatabase)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);

            if (migrateOnStartup is not null)
            {
                builder.UseSetting(MigrateOnStartupKey, migrateOnStartup);
            }
        }
    }
}
