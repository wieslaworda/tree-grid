using System.Security.Cryptography;
using System.Text;
using Api.Errors;

namespace Api.Auth;

/// <summary>
/// Bramka wspólnego sekretu Node→API: jedyne miejsce, które rozstrzyga, czy
/// żądanie przyszło od serwera React Routera. Każde żądanie poza
/// <c>GET /health</c> bez parametru <c>fail</c> musi nieść nagłówek
/// <see cref="Header"/> z wartością równą <c>Auth:InternalApiSecret</c>
/// (<see cref="AuthSecrets.InternalApiSecretKey"/>); inaczej dostaje 401
/// w kopercie z kodem <see cref="ApiErrorCodes.CallerUnauthenticated"/>,
/// zanim wykona się jakikolwiek endpoint.
/// </summary>
/// <remarks>
/// Na bramce stoi wiarygodność wszystkiego, co API przyjmuje od Node bez
/// sprawdzania: nagłówka tożsamości <c>X-TreeGrid-User</c>
/// (<c>Api.Tree.TreeIdentity</c>), wydania klucza podpisu sesji
/// (<c>/internal/session-signing-key</c>) i zapisu wspólnych słowników. Do
/// zmiany <c>hosting-monsterasp</c> niosła je topologia — Kestrel wyłącznie na
/// pętli zwrotnej i tunel wyłącznie na port 3000. W celu MonsterASP API ma
/// publiczny hostname, więc topologia przestaje cokolwiek gwarantować; bramka
/// działa tak samo w obu celach i w każdym środowisku.
///
/// Bramki nie da się wyłączyć konfiguracją i ma tak zostać. Brak sekretu albo
/// sekret krótszy niż <see cref="AuthSecrets.MinimumInternalApiSecretLength"/>
/// nie otwiera jej, tylko zamyka: poza Development start odmawia
/// (<see cref="AuthSecrets.FindProblems"/>), a w Development wstaje
/// z ostrzeżeniem i bramka odrzuca każde żądanie poza wyjątkiem niżej.
///
/// Wyjątek <c>GET /health</c> istnieje, bo na nim stoi wykrywanie gotowości API
/// (<c>start-api.ps1</c>, <c>playwright.config.ts</c>) i trasa
/// <c>/api/health</c>; odpowiedź nie niesie niczego poza <c>status</c>.
/// Wyjątek nie obejmuje <c>?fail=true</c> (w żadnym zapisie nazwy parametru):
/// ta ścieżka zapisuje wpis Error do pliku logu, więc bez sekretu każdy
/// mógłby zalewać dysk. Ścieżka jest porównywana dokładnie, bez wielkości
/// liter; inne zapisy (np. końcowy ukośnik) dostają 401 — bramka myli się
/// wyłącznie w stronę odmowy.
///
/// Odmowa nie trafia do pliku logu: plik zbiera błędy aplikacji, a ruch bez
/// sekretu z publicznego hostname'u zamieniłby go w dziennik skanerów. Wartość
/// nagłówka nie trafia nigdzie — ani do logu, ani do <c>context</c> koperty.
/// </remarks>
internal static class InternalCaller
{
    /// <summary>
    /// Nazwa nagłówka z sekretem. Musi być identyczna ze stałą
    /// <c>INTERNAL_HEADER</c> klienta API po stronie React Routera
    /// (<c>app/lib/api.server.ts</c>); zgodność jest utrzymywana ręcznie
    /// i przypięta testem.
    /// </summary>
    public const string Header = "X-TreeGrid-Internal";

    /// <summary>
    /// Jeden komunikat na brak nagłówka, złą wartość i nieustawiony sekret
    /// po stronie API — rozróżnienie pomagałoby wyłącznie zgadującemu.
    /// </summary>
    internal const string RefusalMessage = "Żądanie nie pochodzi od serwera aplikacji.";

    private const string HealthPath = "/health";

    /// <summary>Parametr wymuszający ścieżkę błędną <c>/health</c> (<c>Program.cs</c>).</summary>
    private const string HealthFailParameter = "fail";

    /// <summary>
    /// Wpina bramkę w potok. Miejsce wpięcia jest częścią kontraktu: po
    /// <c>UseApiErrorContract()</c>, żeby wyjątek w bramce też skończył się
    /// kopertą, i przed <c>UseRateLimiter()</c>, żeby żądanie bez sekretu nie
    /// zużyło okna limitu rejestracji.
    /// </summary>
    public static WebApplication UseInternalCallerGate(this WebApplication app)
    {
        // Sekret czytany raz, przy wpięciu — konfiguracja sekretów nie zmienia
        // się w trakcie życia procesu, a `AuthSecrets` i tak jest singletonem.
        var secret = app.Services.GetRequiredService<AuthSecrets>().FindInternalApiSecret();
        var expected = secret is null ? null : Encoding.UTF8.GetBytes(secret);

        app.Use(async (context, next) =>
        {
            if (IsExempt(context.Request) || CarriesSecret(context.Request, expected))
            {
                await next(context);

                return;
            }

            context.Response.StatusCode = StatusCodes.Status401Unauthorized;

            await context.Response.WriteAsJsonAsync(RefusalError(), context.RequestAborted);
        });

        return app;
    }

    /// <summary>
    /// Koperta odmowy z pustym <c>context</c> — wydzielona, żeby jej kształt
    /// dało się sprawdzić bez potoku HTTP.
    /// </summary>
    internal static ApiError RefusalError()
        => ApiError.Create(ApiErrorCodes.CallerUnauthenticated, RefusalMessage);

    private static bool IsExempt(HttpRequest request)
        => HttpMethods.IsGet(request.Method)
            && request.Path.Equals(new PathString(HealthPath), StringComparison.OrdinalIgnoreCase)
            && !request.Query.ContainsKey(HealthFailParameter);

    /// <summary>
    /// Czy żądanie niesie dokładnie jedną wartość nagłówka równą sekretowi.
    /// Porównanie stałoczasowe na bajtach UTF-8: czas odpowiedzi nie może
    /// zdradzać, ile znaków początku się zgadza. Brak sekretu po stronie API
    /// (<paramref name="expected"/> równe <c>null</c>) odrzuca każde żądanie,
    /// także z pustym nagłówkiem.
    /// </summary>
    private static bool CarriesSecret(HttpRequest request, byte[]? expected)
    {
        if (expected is null)
        {
            return false;
        }

        var values = request.Headers[Header];

        if (values.Count != 1 || string.IsNullOrEmpty(values[0]))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(values[0]!), expected);
    }
}
