using System.Data.Common;
using System.Text;
using Api.Auth;
using Api.Categories;
using Api.Data;
using Api.Errors;
using Api.Mail;
using Api.Objects;
using Api.Screens;
using Api.Tree;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Serilog;
using Serilog.Core;

// Limit oczekiwania na zajętą bazę, w milisekundach. Musi być niezerowy: WAL
// pozwala czytać w trakcie zapisu, ale dwa zapisy nadal się wykluczają i bez
// tego limitu drugi z nich dostaje SQLITE_BUSY natychmiast, zamiast poczekać.
const int busyTimeoutMilliseconds = 5000;

// Flaga migracji przy starcie poza Development (trzecia ścieżka migracji, opis
// przy jej użyciu niżej). Domyślnie `false`: bez niej start odmawia na
// niezmigrowanej bazie.
const string migrateOnStartupKey = "Database:MigrateOnStartup";

var builder = WebApplication.CreateBuilder(args);

// Błędy API trafiają dodatkowo do pliku w katalogu z `FileLogging:Directory`
// (PRD, NFR o logowaniu błędów). Serilog jest tu jednym dostawcą więcej obok
// konsoli, a nie zamiennikiem potoku logowania — konsola zostaje z poziomami
// i formatem z sekcji `Logging`. Plik dostaje wyłącznie Error i wyżej, bo PRD
// wymaga zapisu błędów, a nie dziennika ruchu: wpisy informacyjne (w tym
// każde zapytanie SQL w Development) zasypałyby plik i wydłużyły szukanie
// konkretnego wyjątku.
//
// Rejestrowana jest instancja, nie statyczny `Log.Logger`: w procesie testów
// żyje naraz kilka hostów, każdy z własnym katalogiem logu. `dispose: true`
// oddaje zamknięcie pliku hostowi — zwalnia go razem z kontenerem usług.
var fileLogger = CreateFileLogger(builder.Configuration, builder.Environment.ContentRootPath);
builder.Logging.AddSerilog(fileLogger, dispose: true);

// Reszta startu stoi w `try`, żeby wyjątek startu (inicjalizacja bazy, `Build()`,
// migracje, wiązanie portu w `app.Run()`) zostawił ślad w pliku — szczegóły
// przy `catch` na końcu.
try
{
    // Add services to the container.
    // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
    builder.Services.AddOpenApi();

    var connectionString = InitializeDatabaseFile(
        builder.Configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "Brak connection stringu 'ConnectionStrings:Default' w konfiguracji."),
        builder.Environment.ContentRootPath);

    builder.Services.AddDbContext<AppDbContext>(options => options
        .UseSqlite(connectionString)
        .AddInterceptors(new SqliteBusyTimeoutInterceptor(busyTimeoutMilliseconds)));

    // Progi blokady konta są decyzją produktową, nie techniczną, więc mieszkają
    // w konfiguracji — zmiana progu nie ma wymagać przebudowy aplikacji.
    var lockout = builder.Configuration.GetSection("Identity:Lockout");

    // `AddIdentityCore`, a nie `AddIdentity`. To drugie rejestruje własne schematy
    // uwierzytelniania ciasteczkowego, a sesja w tej aplikacji żyje wyłącznie po
    // stronie serwera React Routera — dwa równoległe mechanizmy sesji to dokładnie
    // ta konfiguracja, w której nie wiadomo, który wygrywa. Tutaj potrzebny jest
    // sam `UserManager`: magazyn kont i weryfikacja hasła, bez potoku HTTP.
    builder.Services
        .AddIdentityCore<AppUser>(options =>
        {
            // Identyfikatorem logowania jest login (`UserName`, PRD FR-001
            // w wersji z 2026-10-10), a adres e-mail jest daną konta. Adres nie
            // jest unikalny: kilka kont może mieć ten sam adres, a osobę
            // rozpoznaje unikalny login. Identity i tak wymaga adresu w poprawnym
            // kształcie — sprawdza go już krok 1 (`RegistrationRules`).
            options.User.RequireUniqueEmail = false;

            // Podniesiona wyłącznie minimalna długość. Pozostałe reguły złożoności
            // zostają domyślne — PRD nie stawia w tej sprawie żadnego wymagania,
            // a wymyślanie go tutaj byłoby decyzją produktową bez podstawy.
            options.Password.RequiredLength = 10;

            // Blokada musi obejmować konta nowe, bo inaczej dotyczy dokładnie tych
            // kont, których nikt nie atakuje. Licznik prowadzi ręcznie endpoint
            // logowania z Fazy 2 — `AddIdentityCore` nie robi tego za nas.
            options.Lockout.AllowedForNewUsers = true;
            options.Lockout.MaxFailedAccessAttempts = lockout.GetValue("MaxFailedAccessAttempts", 5);
            options.Lockout.DefaultLockoutTimeSpan =
                TimeSpan.FromMinutes(lockout.GetValue("LockoutMinutes", 15));
        })
        .AddEntityFrameworkStores<AppDbContext>();

    // Sekret uwierzytelniania — klucz podpisu ciasteczka sesji — czytany jest ze
    // standardowej konfiguracji: w Development z `user-secrets`, poza nim ze
    // zmiennych środowiskowych. Żadnego dodatkowego kodu to nie wymaga, bo oba
    // dostawcy są domyślne, a `appsettings.json` niesie wyłącznie strukturę.
    // Szczegóły i kształt poleceń — w `Api.Auth.AuthSecrets`.
    var authSecrets = AuthSecrets.FromConfiguration(builder.Configuration);
    builder.Services.AddSingleton(authSecrets);

    // Wysyłka kodu weryfikacyjnego na adres rejestrującego (S-14, S-15).
    // Transport wybiera `Mail:Transport` raz, przy starcie: SMTP albo pliki
    // `.eml` w katalogu (pętla deweloperska, testy, E2E). Hasło SMTP jest
    // sekretem na tych samych zasadach co klucz podpisu — szczegóły
    // w `Api.Mail.MailSettings`.
    var mailSettings = MailSettings.FromConfiguration(builder.Configuration, builder.Environment.ContentRootPath);
    builder.Services.AddSingleton(mailSettings);
    builder.Services.AddSingleton<IVerificationMailSender>(mailSettings.UsesDirectory
        ? new DirectoryVerificationMailSender(mailSettings)
        : new SmtpVerificationMailSender(mailSettings));

    // Limit tempa kroku 1 rejestracji: każde żądanie wysyła wiadomość na adres
    // wpisany w formularzu, więc bez limitu formularz jest generatorem poczty
    // z konta nadawcy na dowolny adres podany przez gościa
    // (OWASP F-003, TG-SEC-04). Okno stałe i jeden licznik na cały proces, a nie
    // per adres — API widzi wyłącznie serwer React Routera: żądanie bez
    // wspólnego sekretu odrzuca bramka `UseInternalCallerGate()` przed limiterem
    // (w obu celach, także tam, gdzie API ma publiczny hostname), a każdy
    // gość przychodzi przez ten sam proces Node. Adres gościa i tak nie
    // dochodzi do API. Wartości są
    // decyzją produktową, więc mieszkają w konfiguracji; testy integracyjne
    // podnoszą limit tym samym kluczem.
    var registrationRateLimit = builder.Configuration.GetSection("Auth:RegistrationRateLimit");

    builder.Services.AddRateLimiter(options =>
    {
        options.AddFixedWindowLimiter(AuthEndpoints.RegistrationRateLimitPolicy, limiter =>
        {
            limiter.PermitLimit = registrationRateLimit.GetValue("PermitLimit", 5);
            limiter.Window = TimeSpan.FromMinutes(registrationRateLimit.GetValue("WindowMinutes", 60));

            // Bez kolejki: nadmiar dostaje odmowę od razu, a nie wisi godzinę.
            limiter.QueueLimit = 0;
        });

        // Odmowa nie przechodzi przez żaden endpoint ani przez obsługę statusów
        // z `UseApiErrorContract` (treść jest już zapisana), więc kopertę
        // w kontrakcie błędów trzeba napisać tutaj.
        options.OnRejected = (context, cancellationToken) =>
        {
            context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

            return new ValueTask(context.HttpContext.Response.WriteAsJsonAsync(
                AuthResponses.RateLimited(),
                cancellationToken));
        };
    });

    var app = builder.Build();

    // Ten sam wzorzec, którym niżej odmawia startu niezmigrowana baza: brak sekretu
    // albo niekompletna poczta są błędem konfiguracji, więc mają zatrzymać start
    // i nazwać brakujący klucz, zamiast zamienić się w cichą podatność albo w 503
    // przy pierwszej rejestracji. Sprawdzenie obejmuje każde środowisko poza
    // Development — tam sekretów może jeszcze nie być, a ścieżki, które ich
    // potrzebują, i tak odmawiają działania bez nich
    // (`AuthSecrets.RequireSessionSigningKey`, `MailSettings.ThrowIfIncomplete`,
    // bramka wspólnego sekretu, która bez niego odrzuca wszystko poza
    // `GET /health`). Do logu trafiają wyłącznie nazwy kluczy; żadna wartość
    // nie opuszcza konfiguracji.
    var mailProblems = mailSettings.FindProblems(app.Environment.IsDevelopment());

    if (!app.Environment.IsDevelopment())
    {
        var startProblems = authSecrets.FindProblems().Concat(mailProblems).ToList();

        if (startProblems.Count > 0)
        {
            app.Logger.LogCritical(
                "Konfiguracja sekretów i poczty jest niekompletna: {Problems} Start przerwany. " +
                "Ustaw brakujące klucze zmiennymi środowiskowymi, zapisując dwukropek " +
                "jako podwójne podkreślenie (np. Auth__SessionSigningKey, Auth__InternalApiSecret, " +
                "Mail__Smtp__Password).",
                string.Join(" ", startProblems));

            // Odmowa kończy proces bez zwolnienia hosta, więc logger plikowy
            // zwalniamy sami — dopiero to gwarantuje, że wpis jest na dysku.
            fileLogger.Dispose();
            return 1;
        }
    }
    else
    {
        // W Development start wstaje, ale brak ma być widoczny od razu na
        // konsoli, a nie dopiero jako 503 przy pierwszej rejestracji.
        if (mailProblems.Count > 0)
        {
            app.Logger.LogWarning(
                "Konfiguracja poczty jest niekompletna: {Problems} Krok 1 rejestracji odpowie mail_unavailable.",
                string.Join(" ", mailProblems));
        }

        // To samo dla wspólnego sekretu Node→API: bez niego bramka odrzuca
        // każde wywołanie z serwera React Routera i objawem byłby wyłącznie
        // ekran logowania, który nie przyjmuje żadnego hasła.
        var callerProblems = authSecrets.FindInternalApiSecretProblems();

        if (callerProblems.Count > 0)
        {
            app.Logger.LogWarning(
                "Wspólny sekret Node→API jest nieustawiony albo za krótki: {Problems} " +
                "Każde żądanie poza GET /health dostanie 401 caller_unauthenticated. " +
                "Ustaw zmienną Auth__InternalApiSecret dla obu procesów.",
                string.Join(" ", callerProblems));
        }
    }

    // Ścieżki aplikowania migracji są rozdzielone świadomie. W Development schemat
    // dogania kod przy starcie, żeby pętla deweloperska nie wymagała pamiętania
    // o osobnym kroku. W Production start nie dotyka schematu — ale też nie wstaje
    // po cichu na niezmigrowanej bazie, bo to zamienia błąd konfiguracji w mylący
    // błąd 500 przy pierwszym żądaniu. O tym, która ścieżka obowiązuje, decyduje
    // ASPNETCORE_ENVIRONMENT ustawiany jawnie przez skrypt uruchomieniowy.
    //
    // Trzecia ścieżka jest dla hostingu bez powłoki (MonsterASP), gdzie nie ma
    // jak uruchomić `dotnet ef database update`: poza Development z jawną flagą
    // `Database:MigrateOnStartup` (w repo `true` wyłącznie
    // w `appsettings.MonsterAsp.json`) start sam migruje bazę — ale najpierw
    // robi jej spójną kopię obok pliku (`BackupDatabaseFile`), bo migracji na
    // takim hoście nie da się cofnąć inaczej niż podmianą pliku przez FTP.
    // Porażka kopii albo migracji kończy start odmową, tak jak brak flagi.
    // W Development flaga nie ma znaczenia — tam migracja biegnie zawsze.
    using (var scope = app.Services.CreateScope())
    {
        var database = scope.ServiceProvider.GetRequiredService<AppDbContext>().Database;

        if (app.Environment.IsDevelopment())
        {
            database.Migrate();
        }
        else
        {
            var pending = database.GetPendingMigrations().ToList();

            if (pending.Count > 0 && !app.Configuration.GetValue(migrateOnStartupKey, false))
            {
                app.Logger.LogCritical(
                    "Baza danych nie jest zmigrowana — oczekujące migracje: {Pending}. " +
                    "Start przerwany. Zastosuj je poleceniem: " +
                    "dotnet ef database update --project src/Api",
                    string.Join(", ", pending));

                // Jak przy odmowie z braku sekretów — logger zwalniamy sami.
                fileLogger.Dispose();
                return 1;
            }

            if (pending.Count > 0)
            {
                // Nazwa kopii mówi, przed którą migracją powstała: przy kilku
                // oczekujących jest to ostatnia z nich, czyli stan docelowy.
                var backupPath = BackupPathFor(database, pending[^1]);

                try
                {
                    BackupDatabaseFile(database, backupPath);
                }
                catch (Exception ex)
                {
                    app.Logger.LogCritical(
                        ex,
                        "Kopia bazy przed migracją do {Backup} nie powiodła się — migracje {Pending} " +
                        "nie zostały zastosowane. Start przerwany. Jeśli plik kopii już istnieje " +
                        "(np. po wcześniejszej nieudanej migracji), przenieś go albo usuń.",
                        backupPath,
                        string.Join(", ", pending));

                    fileLogger.Dispose();
                    return 1;
                }

                try
                {
                    database.Migrate();
                }
                catch (Exception ex)
                {
                    app.Logger.LogCritical(
                        ex,
                        "Migracja bazy przy starcie nie powiodła się — oczekujące migracje: {Pending}. " +
                        "Start przerwany. Kopia sprzed migracji: {Backup}.",
                        string.Join(", ", pending),
                        backupPath);

                    fileLogger.Dispose();
                    return 1;
                }

                app.Logger.LogInformation(
                    "Baza zmigrowana przy starcie ({MigrateOnStartupKey}): {Pending}. Kopia sprzed migracji: {Backup}.",
                    migrateOnStartupKey,
                    string.Join(", ", pending),
                    backupPath);
            }
        }
    }

    // Configure the HTTP request pipeline.

    // Kontrakt błędów wpina się przed routingiem, żeby objąć także te odpowiedzi,
    // których nie tworzy żaden nasz endpoint: nieobsłużone wyjątki i statusy
    // generowane przez sam framework. Wpięcie po routingu zostawiłoby 404 z literówki
    // w adresie w formacie ProblemDetails, czyli w kształcie sprzecznym z CLAUDE.md.
    app.UseApiErrorContract();

    // Bramka wspólnego sekretu Node→API (`Api.Auth.InternalCaller`): żądanie
    // bez sekretu dostaje 401 `caller_unauthenticated`, zanim wykona się
    // jakikolwiek endpoint. Wyjątek to wyłącznie `GET /health` bez `fail`.
    // Po kontrakcie błędów, żeby i tu wyjątek skończył się kopertą; przed
    // limiterem, żeby żądania bez sekretu nie zużywały okna rejestracji.
    // Dopasowanie trasy (niejawne `UseRouting` z `WebApplication`) biegnie
    // wcześniej, ale niczego nie wykonuje — handler i limiter działają dopiero
    // za bramką, a adres bez trasy też dostaje 401, nie 404.
    app.UseInternalCallerGate();

    // Po kontrakcie błędów, żeby wyjątek w limiterze też skończył się kopertą.
    // Polityka działa wyłącznie tam, gdzie endpoint ją przypina
    // (`RequireRateLimiting` przy `POST /auth/register`).
    app.UseRateLimiter();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    // Dowodzi dwóch rzeczy naraz: API żyje i baza jest osiągalna. Na tym endpoincie
    // opiera się wykrywanie gotowości API oraz trasa zasobowa `app/routes/api.health.ts`,
    // która przepuszcza treść bez interpretacji. Dlatego `GET /health` jako jedyny
    // przechodzi bramkę wspólnego sekretu bez nagłówka — ale nie z `?fail=true`,
    // bo ta ścieżka pisze do pliku logu.
    //
    // Sprawdzana jest osiągalność pliku bazy, a nie zawartość jakiejkolwiek tabeli.
    // Do F-01 endpoint liczył wiersze tabeli technicznej; ta tabela zniknęła razem
    // z rusztowaniem, a wiązanie zdrowia API z dowolną tabelą domenową oznaczałoby,
    // że każdy przyszły plaster przepisuje ten endpoint od nowa.
    //
    // `?fail=true` wymusza ścieżkę błędną przez rzucenie wyjątku, a nie przez ręcznie
    // zbudowaną odpowiedź — ręczna dowiodłaby tylko tego, że umiemy zserializować
    // własny typ, podczas gdy sprawdzana jest ścieżka frameworka.
    app.MapGet("/health", async (AppDbContext dbContext, bool? fail, CancellationToken cancellationToken) =>
    {
        if (fail == true)
        {
            throw new InvalidOperationException(
                "Wymuszona ścieżka błędna endpointu /health (parametr fail=true).");
        }

        if (!await dbContext.Database.CanConnectAsync(cancellationToken))
        {
            throw new InvalidOperationException(
                "Baza danych jest nieosiągalna — plik bazy nie istnieje albo nie da się go otworzyć.");
        }

        return Results.Ok(new { status = "ok" });
    });

    // Rejestracja, logowanie i wydanie klucza podpisu sesji. Endpointy mieszkają
    // w `Api.Auth`, bo ich treścią są reguły bezpieczeństwa, a nie uruchamianie
    // aplikacji — i ta odległość jest celowa: reguły mają się czytać w jednym
    // miejscu, razem z powodami, dla których są takie, a nie inne.
    app.MapAuthEndpoints();

    // Słownik obiektów (S-02). Ten sam podział co wyżej: reguły słownika —
    // normalizacja kodu, wykrywanie cyklu, warunek usunięcia — i powody, dla
    // których zapis idzie w transakcji, czyta się w `Api.Objects`.
    app.MapObjectEndpoints();

    // Słownik kategorii (S-09), ten sam podział — reguły funkcji agregującej
    // w `Api.Categories`.
    app.MapCategoryEndpoints();

    // Nazwane drzewa użytkownika i ich węzły (S-03), ten sam podział — reguły
    // drzewa (reguła użycia obiektów FR-004, limit węzłów, nazwa unikalna
    // w obrębie konta) i model własności przez drzewo w `Api.Tree`,
    // a tam też model zaufania nagłówka tożsamości, na którym stoją te endpointy:
    // `TreeIdentity` mówi, które warunki infrastruktury go niosą.
    app.MapTreeEndpoints();

    // Nazwane ekrany użytkownika (S-06), ten sam podział — walidacja nazwy, ziarna
    // i listy kategorii domyślnych oraz wyliczenie przypisań kategorii do węzłów
    // w `Api.Screens`. Tożsamość i jej model zaufania są wspólne z drzewami
    // (`TreeIdentity`).
    app.MapScreenEndpoints();

    // Wartości ekranu dla doby (S-05) — oś czasu rzeczywistej doby Europe/Warsaw
    // i powtarzalne wartości w `Api.Screens.ScreenValuesRules`; tożsamość
    // i kontrola właściciela jak w odczycie ekranu.
    app.MapScreenValuesEndpoints();

    app.Run();
    return 0;
}
// `HostAbortedException` nie jest błędem: narzędzia EF Core (`dotnet ef`)
// uruchamiają `Program` i przerywają go tym wyjątkiem na `Build()`, więc wpis
// Fatal z tej ścieżki zostawiałoby każde `dotnet ef migrations add`.
//
// Logger jest zwalniany jawnie, bo proces kończy się bez zwolnienia hosta,
// a wyjątek idzie dalej przez `throw;`, a nie `return 1`: przed `Build()` nie
// ma jeszcze logowania na konsolę, więc połknięcie wyjątku usunęłoby go ze
// stderr (z którego diagnozę startu bierze `start-api.ps1`) i zmieniło kod
// wyjścia. Wyjątek z `app.Run()` (np. zajęty port) przychodzi tu już po
// zwolnieniu hosta razem z loggerem — wtedy wpis Fatal przepada po cichu, a do
// pliku trafia wcześniejszy wpis frameworka „Hosting failed to start" z tym
// samym wyjątkiem.
catch (Exception ex) when (ex is not HostAbortedException)
{
    fileLogger.Fatal(ex, "Start API przerwany nieobsłużonym wyjątkiem.");
    fileLogger.Dispose();
    throw;
}

// Przygotowuje plik bazy, zanim cokolwiek się do niego połączy, i zwraca
// connection string ze ścieżką bezwzględną.
//
// Wykonuje się przed `builder.Build()` i to jest istotne: narzędzia EF Core
// (`dotnet ef database update`) uruchamiają tę aplikację i zatrzymują ją
// dokładnie na `Build()`, więc inicjalizacja umieszczona niżej nigdy by się dla
// nich nie wykonała, a baza utworzona z wiersza poleceń zostałaby poza trybem WAL.
//
// Ścieżka względna z konfiguracji jest rozwiązywana względem katalogu treści,
// a nie katalogu roboczego procesu — plik bazy ma leżeć obok aplikacji
// niezależnie od tego, skąd ją uruchomiono.
//
// `PRAGMA journal_mode=WAL` zapisuje się w nagłówku pliku bazy i obowiązuje
// każde kolejne połączenie, więc wystarczy raz przy inicjalizacji. Bez WAL
// równoległy odczyt gridu i zapis ekranu dają SQLITE_BUSY (infrastructure.md:219).
static string InitializeDatabaseFile(string connectionString, string contentRootPath)
{
    var parsed = new SqliteConnectionStringBuilder(connectionString);

    if (!Path.IsPathRooted(parsed.DataSource))
    {
        parsed.DataSource = Path.GetFullPath(Path.Combine(contentRootPath, parsed.DataSource));
    }

    Directory.CreateDirectory(Path.GetDirectoryName(parsed.DataSource)!);

    using var connection = new SqliteConnection(parsed.ConnectionString);
    connection.Open();

    using var pragma = connection.CreateCommand();
    pragma.CommandText = "PRAGMA journal_mode=WAL;";
    pragma.ExecuteScalar();

    return parsed.ConnectionString;
}

// Ścieżka kopii bazy sprzed migracji: obok pliku bazy, z nazwą ostatniej
// oczekującej migracji (`treegrid.db.pre-<migracja>.bak`). Plik bazy jest tu
// już bezwzględny — connection string zbudował `InitializeDatabaseFile`. Na
// MonsterASP kopia ląduje więc w `tg-data`, poza `wwwroot` i poza HTTP.
static string BackupPathFor(DatabaseFacade database, string lastPendingMigration)
{
    var databasePath = new SqliteConnectionStringBuilder(database.GetConnectionString()).DataSource;

    return $"{databasePath}.pre-{lastPendingMigration}.bak";
}

// Spójna kopia pliku bazy przez `VACUUM INTO`, a nie kopiowanie pliku: przy WAL
// część zatwierdzonych zmian leży jeszcze w `-wal`, więc sam plik `.db` nie jest
// spójnym obrazem bazy, a `VACUUM INTO` czyta bazę jak każde zapytanie, razem
// z WAL. Ścieżka idzie parametrem, nie sklejonym literałem SQL, więc apostrof
// w nazwie katalogu niczego nie psuje. Połączenie otwiera EF, więc dostaje
// `busy_timeout` z interceptora. SQLite odmawia zapisu do istniejącego,
// niepustego pliku — istniejąca kopia nie zostanie nadpisana.
static void BackupDatabaseFile(DatabaseFacade database, string backupPath)
{
    database.OpenConnection();

    try
    {
        using var command = database.GetDbConnection().CreateCommand();
        command.CommandText = "VACUUM INTO $path;";

        var parameter = command.CreateParameter();
        parameter.ParameterName = "$path";
        parameter.Value = backupPath;
        command.Parameters.Add(parameter);

        command.ExecuteNonQuery();
    }
    finally
    {
        database.CloseConnection();
    }
}

// Buduje logger plikowy błędów API: jeden plik na dobę `api-YYYYMMDD.log`,
// 31 najnowszych zostaje.
//
// Ścieżka względna jest rozwiązywana względem katalogu treści, tak jak plik bazy
// w `InitializeDatabaseFile` — domyślne `Log` ląduje w `src/Api/Log/`, obok
// `src/Api/db/`, niezależnie od katalogu roboczego procesu. Brak klucza jest
// błędem konfiguracji, a nie powodem, żeby po cichu pisać w dowolne miejsce.
//
// `RequestId` i `RequestPath` nie są dopisywane przez nas: to właściwości zakresu
// logowania, który hosting ASP.NET Core otwiera dla każdego żądania, a dostawca
// Serilog przenosi je do wpisu. `RequestId` to `HttpContext.TraceIdentifier`,
// czyli ta sama wartość, którą odpowiedź 500 oddaje jako `context.requestId`
// (`ApiErrorHandling`) — po niej zgłoszenie łączy się z wyjątkiem w pliku.
// Wpis spoza żądania (np. ze startu) ma oba pola puste.
//
// Tryb współdzielony, bo bez niego pierwszy proces API trzyma plik na
// wyłączność, a drugi (np. przypadkowy drugi start) traci swój wpis po cichu —
// Serilog zgłasza błąd zapisu wyłącznie do `SelfLog`. Limit rozmiaru chroni
// dysk przed pętlą błędów; po jego przekroczeniu powstaje kolejny plik tej doby,
// liczony do tych samych 31.
static Logger CreateFileLogger(IConfiguration configuration, string contentRootPath)
{
    const string directoryKey = "FileLogging:Directory";

    var directory = configuration[directoryKey];

    if (string.IsNullOrWhiteSpace(directory))
    {
        throw new InvalidOperationException(
            $"Brak katalogu logu '{directoryKey}' w konfiguracji.");
    }

    if (!Path.IsPathRooted(directory))
    {
        directory = Path.GetFullPath(Path.Combine(contentRootPath, directory));
    }

    return new LoggerConfiguration()
        .MinimumLevel.Error()
        .WriteTo.File(
            Path.Combine(directory, "api-.log"),
            outputTemplate:
                "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {SourceContext} " +
                "RequestId={RequestId} {RequestPath}{NewLine}{Message:lj}{NewLine}{Exception}",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 31,
            fileSizeLimitBytes: 50 * 1024 * 1024,
            rollOnFileSizeLimit: true,
            shared: true,
            encoding: new UTF8Encoding(encoderShouldEmitUTF8Identifier: false))
        .CreateLogger();
}

/// <summary>
/// Nadaje limit oczekiwania na zajętą bazę każdemu otwieranemu połączeniu.
/// W przeciwieństwie do trybu WAL `busy_timeout` jest ustawieniem połączenia,
/// a nie pliku bazy — nie da się go ustawić raz, a połączenia pochodzą z puli.
/// </summary>
internal sealed class SqliteBusyTimeoutInterceptor(int milliseconds) : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using (var command = connection.CreateCommand())
        {
            command.CommandText = $"PRAGMA busy_timeout={milliseconds};";
            command.ExecuteNonQuery();
        }

        base.ConnectionOpened(connection, eventData);
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = $"PRAGMA busy_timeout={milliseconds};";
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }
}
