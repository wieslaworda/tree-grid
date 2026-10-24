using System.Globalization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Api.Auth;
using Api.Data;
using Api.Mail;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MimeKit;

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
///
/// Poczta z kodem weryfikacyjnym ląduje jako pliki <c>.eml</c> we własnym
/// katalogu instancji (<see cref="MailDirectory"/>), sprzątanym razem z logiem;
/// kod czyta z niego <see cref="ReadLastVerificationCode"/>. Konfiguracja
/// wskazuje przy tym transport <c>Smtp</c> z kompletem wartości technicznych,
/// a nadawcę plikowego podstawia <c>ConfigureTestServices</c>: poza Development
/// start odmawia transportu <c>Directory</c>, a host testowy ma przechodzić tę
/// samą kontrolę startu co produkcja. Z serwerem SMTP nic się nie łączy.
/// Limity tempa kroku 1, kroku 2 i logowania są podniesione (<see cref="RegistrationPermitLimit"/>,
/// <see cref="ConfirmPermitLimit"/>, <see cref="LoginPermitLimit"/>), bo licznik jest jeden
/// na host, a testy klasy dzielą host.
///
/// Wspólny sekret Node→API też jest losowy i jedzie przez <c>UseSetting</c>,
/// a <see cref="ConfigureClient"/> dokleja go nagłówkiem do każdego klienta
/// z <c>CreateClient</c> — tak jak serwer React Routera do każdego wywołania.
/// Dzięki temu testy sprzed bramki (<c>Api.Auth.InternalCaller</c>) biegną bez
/// zmian; test, który sprawdza samą bramkę, zdejmuje albo podmienia nagłówek
/// na swoim kliencie.
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

    private readonly string _sessionSigningKey = RandomSecret(AuthSecrets.MinimumSessionSigningKeyLength * 2);

    private readonly string _internalApiSecret = RandomSecret(AuthSecrets.MinimumInternalApiSecretLength * 2);

    /// <summary>
    /// Hasło SMTP tylko po to, żeby konfiguracja przeszła kontrolę startu —
    /// losowe i wyłącznie w pamięci, jak pozostałe sekrety fabryki.
    /// </summary>
    private readonly string _smtpPassword = RandomSecret(32);

    private bool _filesDeleted;

    private string? _hostConnectionString;

    public TestApiFactory()
        : this(migrateDatabase: true)
    {
    }

    /// <summary>
    /// Fabryka z wyborem stanu pliku bazy. <paramref name="migrateDatabase"/>
    /// = <c>false</c> zostawia plik w trybie WAL, ale bez schematu — dla testów
    /// ścieżek migracji przy starcie (<c>MigrateOnStartupIntegrationTests</c>).
    /// </summary>
    protected TestApiFactory(bool migrateDatabase)
    {
        var directory = Path.Combine(Path.GetTempPath(), "treegrid-tests");
        Directory.CreateDirectory(directory);

        var instanceId = Guid.NewGuid().ToString("N");

        DatabasePath = Path.GetFullPath(Path.Combine(directory, $"{instanceId}.db"));
        ConnectionString = new SqliteConnectionStringBuilder { DataSource = DatabasePath }.ToString();
        LogDirectory = Path.GetFullPath(Path.Combine(directory, $"{instanceId}-log"));
        MailDirectory = Path.GetFullPath(Path.Combine(directory, $"{instanceId}-mail"));

        // Gdy konstruktor rzuci, xUnit nie zwolni fixture — sprzątanie tutaj.
        try
        {
            InitializeDatabaseFile(migrateDatabase);
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
    /// Bezwzględny katalog plików <c>.eml</c> tej instancji, podawany hostowi
    /// jako <c>Mail:Directory:Path</c>. Nadawca zakłada go przy pierwszej
    /// wiadomości.
    /// </summary>
    public string MailDirectory { get; }

    /// <summary>
    /// Limit żądań kroku 1 rejestracji w oknie limitera. Domyślnie wysoki, żeby
    /// kolejne testy jednej klasy nie dostawały 429; klasa pochodna obniża go,
    /// gdy sprawdza sam limit.
    /// </summary>
    protected virtual int RegistrationPermitLimit => 1000;

    /// <summary>Limit żądań <c>POST /auth/login</c> w oknie limitera — z tego samego powodu wysoki.</summary>
    protected virtual int LoginPermitLimit => 1000;

    /// <summary>Limit żądań kroku 2 rejestracji w oknie limitera — z tego samego powodu wysoki.</summary>
    protected virtual int ConfirmPermitLimit => 1000;

    /// <summary>
    /// Kod weryfikacyjny z najnowszej wiadomości dla <paramref name="login"/>,
    /// odczytany z treści pliku <c>.eml</c> tym samym wyrażeniem, którego używa
    /// setup E2E (<c>VerificationMessage.CodePattern</c>). Brak wiadomości jest
    /// błędem asercji.
    /// </summary>
    public string ReadLastVerificationCode(string login)
    {
        var loginLine = VerificationMessage.LoginLinePrefix + login;

        // Nazwy plików zaczynają się znacznikiem czasu, więc porządek nazw
        // malejąco to porządek od najnowszej wiadomości.
        var files = Directory.Exists(MailDirectory)
            ? Directory.GetFiles(MailDirectory, "*.eml").OrderDescending(StringComparer.Ordinal)
            : Enumerable.Empty<string>();

        foreach (var file in files)
        {
            using var message = MimeMessage.Load(file);
            var text = message.TextBody ?? string.Empty;

            if (!text.Split('\n').Any(line => line.TrimEnd('\r') == loginLine))
            {
                continue;
            }

            var match = Regex.Match(text, VerificationMessage.CodePattern);
            Assert.True(match.Success, $"Wiadomość '{file}' nie zawiera wiersza z kodem.");

            return match.Groups[1].Value;
        }

        Assert.Fail($"Brak wiadomości z kodem dla loginu '{login}' w '{MailDirectory}'.");

        return string.Empty;
    }

    /// <summary>
    /// Pliki kopii bazy sprzed migracji przy starcie
    /// (<c>&lt;plik bazy&gt;.pre-*.bak</c>), leżące obok pliku tej instancji.
    /// </summary>
    public IReadOnlyList<string> FindBackupFiles()
        => Directory.GetFiles(
                Path.GetDirectoryName(DatabasePath)!,
                Path.GetFileName(DatabasePath) + ".pre-*.bak")
            .Order(StringComparer.Ordinal)
            .ToList();

    /// <summary>
    /// Punkt rozszerzenia dla klas pochodnych: nadawca kodu weryfikacyjnego
    /// hosta. Domyślnie pliki <c>.eml</c> w <see cref="MailDirectory"/>.
    /// </summary>
    private protected virtual IVerificationMailSender CreateMailSender(MailSettings settings)
        => new DirectoryVerificationMailSender(settings);

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
        builder.UseSetting(AuthSecrets.SessionSigningKeyKey, _sessionSigningKey);
        builder.UseSetting(AuthSecrets.InternalApiSecretKey, _internalApiSecret);
        builder.UseSetting("FileLogging:Directory", LogDirectory);

        // Komplet `Smtp` dla kontroli startu — wartości techniczne, domena
        // `.invalid` z RFC 2606 nie rozwiązuje się nigdzie. Wysyłkę i tak
        // przejmuje nadawca z `CreateMailSender`.
        builder.UseSetting(MailSettings.TransportKey, MailSettings.SmtpTransport);
        builder.UseSetting(MailSettings.SmtpHostKey, "smtp.invalid");
        builder.UseSetting(MailSettings.SmtpPortKey, "587");
        builder.UseSetting(MailSettings.SmtpUserNameKey, "treegrid-tests");
        builder.UseSetting(MailSettings.SmtpPasswordKey, _smtpPassword);
        builder.UseSetting(MailSettings.FromKey, "treegrid-tests@test.invalid");
        builder.UseSetting(MailSettings.DirectoryPathKey, MailDirectory);
        builder.UseSetting(
            "Auth:RegistrationRateLimit:PermitLimit",
            RegistrationPermitLimit.ToString(CultureInfo.InvariantCulture));
        builder.UseSetting(
            "Auth:LoginRateLimit:PermitLimit",
            LoginPermitLimit.ToString(CultureInfo.InvariantCulture));
        builder.UseSetting(
            "Auth:ConfirmRateLimit:PermitLimit",
            ConfirmPermitLimit.ToString(CultureInfo.InvariantCulture));

        // Opcje kontekstu z `Program.cs` (plik, interceptor busy_timeout) zostają;
        // klasa pochodna może do nich jedynie dołożyć, np. własny interceptor.
        // Nadawca poczty jest podmieniany w całości — rejestracja tutaj wygrywa
        // z tą z `Program.cs`, bo jest późniejsza.
        builder.ConfigureTestServices(services =>
        {
            services.ConfigureDbContext<AppDbContext>(ConfigureAppDbContext);
            services.AddSingleton(provider => CreateMailSender(provider.GetRequiredService<MailSettings>()));
        });
    }

    /// <summary>
    /// Każdy klient z <c>CreateClient</c> niesie wspólny sekret Node→API
    /// nagłówkiem <see cref="InternalCaller.Header"/>. Sama wartość nie
    /// opuszcza fabryki — test bramki potrzebuje jedynie jej braku albo
    /// wartości innej.
    /// </summary>
    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Add(InternalCaller.Header, _internalApiSecret);
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
    /// i — gdy <paramref name="migrate"/> — ze schematem: host w <c>Testing</c>
    /// bez flagi <c>Database:MigrateOnStartup</c> nie migruje sam.
    /// </summary>
    private void InitializeDatabaseFile(bool migrate)
    {
        using (var connection = new SqliteConnection(ConnectionString))
        {
            connection.Open();

            using var pragma = connection.CreateCommand();
            pragma.CommandText = "PRAGMA journal_mode=WAL;";
            pragma.ExecuteScalar();
        }

        if (!migrate)
        {
            return;
        }

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(ConnectionString)
            .AddInterceptors(new SqliteBusyTimeoutInterceptor(BusyTimeoutMilliseconds))
            .Options;

        using var db = new AppDbContext(options);
        db.Database.Migrate();
    }

    /// <summary>
    /// Usuwa plik bazy razem z plikami WAL oraz katalogi logu i poczty. Pula
    /// połączeń trzyma na Windows otwarte uchwyty, więc najpierw jest czyszczona —
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

        // Kopie sprzed migracji przy starcie (`Database:MigrateOnStartup`)
        // leżą obok pliku bazy.
        foreach (var backup in FindBackupFiles())
        {
            TryDeleteFile(backup);
        }

        TryDeleteDirectory(LogDirectory);
        TryDeleteDirectory(MailDirectory);

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
    /// <see cref="TryDeleteFile"/>. Katalogu może nie być — logger i nadawca
    /// poczty zakładają swój dopiero przy pierwszym wpisie.
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
