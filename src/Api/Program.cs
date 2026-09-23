using System.Data.Common;
using Api.Auth;
using Api.Categories;
using Api.Data;
using Api.Errors;
using Api.Objects;
using Api.Tree;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

// Limit oczekiwania na zajętą bazę, w milisekundach. Musi być niezerowy: WAL
// pozwala czytać w trakcie zapisu, ale dwa zapisy nadal się wykluczają i bez
// tego limitu drugi z nich dostaje SQLITE_BUSY natychmiast, zamiast poczekać.
const int busyTimeoutMilliseconds = 5000;

var builder = WebApplication.CreateBuilder(args);

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
        // Adres e-mail jest identyfikatorem logowania (PRD FR-001), więc dwa
        // konta o tym samym adresie uczyniłyby logowanie niejednoznacznym.
        options.User.RequireUniqueEmail = true;

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

// Sekrety aplikacji — kod rejestracyjny i klucz podpisu ciasteczka sesji —
// czytane są ze standardowej konfiguracji: w Development z `user-secrets`,
// poza nim ze zmiennych środowiskowych. Żadnego dodatkowego kodu to nie
// wymaga, bo oba dostawcy są domyślne, a `appsettings.json` niesie wyłącznie
// strukturę. Szczegóły i kształt poleceń — w `Api.Auth.AuthSecrets`.
var authSecrets = AuthSecrets.FromConfiguration(builder.Configuration);
builder.Services.AddSingleton(authSecrets);

var app = builder.Build();

// Ten sam wzorzec, którym niżej odmawia startu niezmigrowana baza: brak sekretu
// jest błędem konfiguracji, więc ma zatrzymać start i nazwać brakujący klucz,
// zamiast zamienić się w cichą podatność przy pierwszym żądaniu. Sprawdzenie
// obejmuje każde środowisko poza Development — tam sekretów może jeszcze nie
// być, a ścieżki, które ich potrzebują, i tak odmawiają działania bez nich
// (`AuthSecrets.RequireRegistrationCode`). Do logu trafiają wyłącznie nazwy
// kluczy; żadna wartość nie opuszcza konfiguracji.
if (!app.Environment.IsDevelopment())
{
    var secretProblems = authSecrets.FindProblems();

    if (secretProblems.Count > 0)
    {
        app.Logger.LogCritical(
            "Konfiguracja sekretów jest niekompletna: {Problems} Start przerwany. " +
            "Ustaw brakujące klucze zmiennymi środowiskowymi, zapisując dwukropek " +
            "jako podwójne podkreślenie (np. Auth__RegistrationCode).",
            string.Join(" ", secretProblems));

        return 1;
    }
}

// Ścieżki aplikowania migracji są rozdzielone świadomie. W Development schemat
// dogania kod przy starcie, żeby pętla deweloperska nie wymagała pamiętania
// o osobnym kroku. W Production start nie dotyka schematu — ale też nie wstaje
// po cichu na niezmigrowanej bazie, bo to zamienia błąd konfiguracji w mylący
// błąd 500 przy pierwszym żądaniu. O tym, która ścieżka obowiązuje, decyduje
// ASPNETCORE_ENVIRONMENT ustawiany jawnie przez skrypt uruchomieniowy.
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

        if (pending.Count > 0)
        {
            app.Logger.LogCritical(
                "Baza danych nie jest zmigrowana — oczekujące migracje: {Pending}. " +
                "Start przerwany. Zastosuj je poleceniem: " +
                "dotnet ef database update --project src/Api",
                string.Join(", ", pending));

            return 1;
        }
    }
}

// Configure the HTTP request pipeline.

// Kontrakt błędów wpina się przed routingiem, żeby objąć także te odpowiedzi,
// których nie tworzy żaden nasz endpoint: nieobsłużone wyjątki i statusy
// generowane przez sam framework. Wpięcie po routingu zostawiłoby 404 z literówki
// w adresie w formacie ProblemDetails, czyli w kształcie sprzecznym z CLAUDE.md.
app.UseApiErrorContract();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Dowodzi dwóch rzeczy naraz: API żyje i baza jest osiągalna. Na tym endpoincie
// opiera się wykrywanie gotowości API oraz trasa zasobowa `app/routes/api.health.ts`,
// która przepuszcza treść bez interpretacji.
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

// Drzewo robocze użytkownika (S-03), ten sam podział — reguły drzewa
// (zapętlenie po ścieżce przodków, duplikat rodzeństwa, limit węzłów)
// w `Api.Tree`, a tam też model zaufania nagłówka tożsamości, na którym stoją
// te endpointy: `TreeIdentity` mówi, które warunki infrastruktury go niosą.
app.MapTreeEndpoints();

app.Run();
return 0;

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
