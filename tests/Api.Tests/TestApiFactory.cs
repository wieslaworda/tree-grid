using System.Security.Cryptography;
using Api.Auth;
using Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Api.Tests;

/// <summary>
/// Host API do testów integracyjnych — jedna instancja na klasę testową
/// (<c>IClassFixture</c>), każda z własnym plikiem SQLite w katalogu
/// tymczasowym. Klasy biegną w xUnit v2 równolegle, więc wspólny plik
/// oznaczałby testy wpływające na siebie przez wspólne słowniki (np. regułę
/// jedynej domyślnej kategorii ekranu), a baza deweloperska
/// <c>src/Api/db/treegrid.db</c> nie może być dotknięta w żadnym przebiegu.
/// </summary>
/// <remarks>
/// Kolejność jest wymuszona przez <c>Program.cs</c>: plik bazy jest otwierany
/// i przełączany w WAL jeszcze przed <c>builder.Build()</c>, a connection string
/// zamyka się w domknięciu <c>AddDbContext</c>. Dlatego ścieżka pliku jedzie
/// przez <c>UseSetting</c> (widoczne już w <c>WebApplication.CreateBuilder</c>),
/// a nie przez podmianę usług — ta przyszłaby za późno. Zmienna środowiskowa
/// <c>ConnectionStrings__Default</c> odpada, bo jest wspólna dla całego procesu.
///
/// Środowisko <c>Testing</c>, a nie domyślne Development fabryki: Development
/// czytałby user-secrets dewelopera, pomijałby kontrolę sekretów i doklejał
/// treść wyjątku do odpowiedzi 500. Poza Development host odmawia startu na
/// niezmigrowanej bazie, więc plik jest migrowany w konstruktorze — zanim
/// cokolwiek dotknie <c>Server</c> albo <c>CreateClient</c>.
///
/// Sekrety są losowane na każdą instancję i żyją wyłącznie w pamięci: nie ma
/// ich w repozytorium ani w logu (lekcja „Sekrety: konfiguracja .NET…").
///
/// Katalog logu błędów (<c>FileLogging:Directory</c>) też jest własny dla
/// instancji i jedzie przez <c>UseSetting</c> z tego samego powodu co baza:
/// logger plikowy powstaje w <c>Program.cs</c> zaraz po
/// <c>WebApplication.CreateBuilder</c>. Bez tego każdy celowy błąd 500 z testów
/// lądowałby w deweloperskim <c>src/Api/Log/</c>. Host zamyka plik logu przy
/// zwolnieniu, więc katalog jest usuwany po <c>base.Dispose</c>, razem z bazą.
/// </remarks>
public class TestApiFactory : WebApplicationFactory<Program>
{
    /// <summary>Nazwa środowiska hosta testowego.</summary>
    public const string EnvironmentName = "Testing";

    /// <summary>
    /// Limit oczekiwania na zajętą bazę dla połączeń otwieranych przez samą
    /// fabrykę (migracja). Ta sama wartość co w <c>Program.cs</c> — zero dałoby
    /// <c>SQLITE_BUSY</c> natychmiast (lekcja „SQLite: zawsze jawny WAL…").
    /// </summary>
    private const int BusyTimeoutMilliseconds = 5000;

    private readonly string _registrationCode = RandomSecret(32);

    private readonly string _sessionSigningKey = RandomSecret(AuthSecrets.MinimumSessionSigningKeyLength * 2);

    private bool _filesDeleted;

    private string? _hostConnectionString;

    public TestApiFactory()
    {
        var directory = Path.Combine(Path.GetTempPath(), "treegrid-tests");
        Directory.CreateDirectory(directory);

        var instanceId = Guid.NewGuid().ToString("N");

        DatabasePath = Path.GetFullPath(Path.Combine(directory, $"{instanceId}.db"));
        ConnectionString = new SqliteConnectionStringBuilder { DataSource = DatabasePath }.ToString();
        LogDirectory = Path.GetFullPath(Path.Combine(directory, $"{instanceId}-log"));

        // Gdy konstruktor rzuci, xUnit nie zwolni fixture — sprzątanie tutaj.
        try
        {
            InitializeDatabaseFile();
        }
        catch
        {
            DeleteTemporaryFiles();
            throw;
        }
    }

    /// <summary>Bezwzględna ścieżka pliku bazy tej instancji.</summary>
    public string DatabasePath { get; }

    /// <summary>Connection string podawany hostowi przez <c>UseSetting</c>.</summary>
    public string ConnectionString { get; }

    /// <summary>
    /// Bezwzględny katalog logu błędów tej instancji, podawany hostowi jako
    /// <c>FileLogging:Directory</c>. Logger tworzy go dopiero przy pierwszym
    /// wpisie, więc do tego czasu może nie istnieć.
    /// </summary>
    public string LogDirectory { get; }

    /// <summary>
    /// Nowy scope usług hosta razem z jego <see cref="AppDbContext"/>. Każdy
    /// odczyt migawki i każdy seed ma brać własny scope, żeby nie czytać stanu
    /// ze śledzenia kontekstu zamiast z bazy.
    /// </summary>
    public AsyncServiceScope CreateDbScope(out AppDbContext db)
    {
        var scope = Services.CreateAsyncScope();
        db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return scope;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(EnvironmentName);
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting(AuthSecrets.RegistrationCodeKey, _registrationCode);
        builder.UseSetting(AuthSecrets.SessionSigningKeyKey, _sessionSigningKey);
        builder.UseSetting("FileLogging:Directory", LogDirectory);

        // Opcje kontekstu z `Program.cs` (plik, interceptor busy_timeout) zostają;
        // klasa pochodna może do nich jedynie dołożyć, np. własny interceptor.
        builder.ConfigureTestServices(services =>
            services.ConfigureDbContext<AppDbContext>(ConfigureAppDbContext));
    }

    /// <summary>
    /// Punkt rozszerzenia dla klas pochodnych: dodatkowa konfiguracja
    /// <see cref="AppDbContext"/> hosta, składana z rejestracją z
    /// <c>Program.cs</c> (np. <c>options.AddInterceptors(…)</c>). Domyślnie nic.
    /// </summary>
    protected virtual void ConfigureAppDbContext(DbContextOptionsBuilder options)
    {
    }

    /// <summary>
    /// Zapamiętuje connection string, którego faktycznie używa host —
    /// <c>Program.cs</c> przebudowuje go przez <c>SqliteConnectionStringBuilder</c>,
    /// więc klucz puli hosta nie musi być identyczny z <see cref="ConnectionString"/>.
    /// Odczyt teraz, bo przy sprzątaniu usługi hosta są już zwolnione.
    ///
    /// Przy okazji fabryka odmawia startu, gdy host pracuje na innym pliku niż
    /// jej własny — np. gdy <c>UseSetting</c> przestałby docierać przed
    /// <c>Build()</c> i wrócił domyślny <c>db/treegrid.db</c>. Szpica
    /// w <c>ApiHostIntegrationTests</c> wykryłaby to dopiero równolegle
    /// z klasami, które już seedują bazę deweloperską.
    /// </summary>
    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);

        using (var scope = host.Services.CreateScope())
        {
            _hostConnectionString = scope.ServiceProvider
                .GetRequiredService<AppDbContext>()
                .Database
                .GetConnectionString();
        }

        var hostDataSource = new SqliteConnectionStringBuilder(_hostConnectionString).DataSource;

        if (!string.Equals(Path.GetFullPath(hostDataSource), DatabasePath, StringComparison.OrdinalIgnoreCase))
        {
            host.Dispose();

            throw new InvalidOperationException(
                $"Host testowy pracuje na '{hostDataSource}' zamiast na pliku fabryki '{DatabasePath}'. " +
                "Odmowa startu, żeby żaden test nie zapisał do tej bazy.");
        }

        return host;
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        DeleteTemporaryFiles();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            DeleteTemporaryFiles();
        }
    }

    /// <summary>
    /// Plik w trybie WAL (jak <c>InitializeDatabaseFile</c> w <c>Program.cs</c>)
    /// i ze schematem — host w <c>Testing</c> nie migruje sam.
    /// </summary>
    private void InitializeDatabaseFile()
    {
        using (var connection = new SqliteConnection(ConnectionString))
        {
            connection.Open();

            using var pragma = connection.CreateCommand();
            pragma.CommandText = "PRAGMA journal_mode=WAL;";
            pragma.ExecuteScalar();
        }

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(ConnectionString)
            .AddInterceptors(new SqliteBusyTimeoutInterceptor(BusyTimeoutMilliseconds))
            .Options;

        using var db = new AppDbContext(options);
        db.Database.Migrate();
    }

    /// <summary>
    /// Usuwa plik bazy razem z plikami WAL oraz katalog logu. Pula połączeń
    /// trzyma na Windows otwarte uchwyty, więc najpierw jest czyszczona —
    /// inaczej usunięcie kończy się wyjątkiem „plik jest używany". Czyszczone
    /// są wyłącznie pule tej instancji: <c>ClearAllPools</c> zamykałby też
    /// połączenia klas biegnących równolegle, a SQLite przy zamknięciu
    /// ostatniego połączenia usuwa i potem odtwarza <c>-wal</c>/<c>-shm</c> —
    /// pod obciążeniem na Windows to źródło przypadkowych błędów I/O
    /// w niezwiązanym teście. Plik logu zamyka już zwolniony host.
    /// </summary>
    private void DeleteTemporaryFiles()
    {
        if (_filesDeleted)
        {
            return;
        }

        foreach (var connectionString in new[] { ConnectionString, _hostConnectionString })
        {
            if (connectionString is not null)
            {
                using var connection = new SqliteConnection(connectionString);
                SqliteConnection.ClearPool(connection);
            }
        }

        foreach (var suffix in new[] { string.Empty, "-wal", "-shm" })
        {
            TryDeleteFile(DatabasePath + suffix);
        }

        TryDeleteDirectory(LogDirectory);

        _filesDeleted = true;
    }

    /// <summary>
    /// Usunięcie bez wyjątku: na Windows antywirus albo indekser potrafi
    /// chwilowo trzymać świeży plik w <c>%TEMP%</c>. Wyjątek z <c>Dispose</c>
    /// xUnit policzyłby jako niezaliczony test, choć żaden test nie padł —
    /// najwyżej zostaje plik w katalogu tymczasowym.
    /// </summary>
    private static void TryDeleteFile(string path)
    {
        const int attempts = 5;

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                File.Delete(path);

                return;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                if (attempt < attempts)
                {
                    Thread.Sleep(100);
                }
            }
        }
    }

    /// <summary>
    /// Usunięcie katalogu z zawartością bez wyjątku, z tych samych powodów co
    /// <see cref="TryDeleteFile"/>. Katalogu może nie być — logger zakłada go
    /// dopiero przy pierwszym błędzie.
    /// </summary>
    private static void TryDeleteDirectory(string path)
    {
        const int attempts = 5;

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, recursive: true);
                }

                return;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                if (attempt < attempts)
                {
                    Thread.Sleep(100);
                }
            }
        }
    }

    private static string RandomSecret(int length)
        => RandomNumberGenerator.GetHexString(length, lowercase: true);
}
