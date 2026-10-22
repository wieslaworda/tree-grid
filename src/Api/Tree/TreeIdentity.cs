using Api.Data;
using Api.Errors;
using Microsoft.EntityFrameworkCore;

namespace Api.Tree;

/// <summary>
/// Tożsamość użytkownika dla endpointów <c>/trees</c>: jedyne miejsce, które
/// zamienia nagłówek żądania na identyfikator istniejącego konta albo na
/// odpowiedź 401 w kontrakcie — i jedyne miejsce, w którym zapisany jest model
/// zaufania, na którym ta zamiana stoi. Korzystają z niej także endpointy
/// <c>/screens</c> (<c>Api.Screens.ScreenEndpoints</c>): ekran ma właściciela
/// tak jak drzewo, a model zaufania jest jeden, więc klasa zostaje
/// w <c>Api.Tree</c>, zamiast rozchodzić się na dwie kopie.
/// </summary>
/// <remarks>
/// API nie ma uwierzytelniania (<c>UseAuthentication</c>) i nie ma go mieć:
/// sesja żyje po stronie serwera React Routera, a ten wysyła identyfikator
/// zalogowanego konta nagłówkiem <see cref="UserHeader"/>, biorąc go z sesji,
/// nigdy z przeglądarki. Nagłówek jest wiarygodny wyłącznie dlatego, że nikt
/// poza tym serwerem nie może go do API dostarczyć:
///
/// - podstawą jest bramka wspólnego sekretu (<c>Api.Auth.InternalCaller</c>):
///   do endpointu dochodzi tylko żądanie z nagłówkiem
///   <c>X-TreeGrid-Internal</c> równym <c>Auth:InternalApiSecret</c>, a ten
///   sekret zna wyłącznie serwer React Routera. Bramka działa w obu celach —
///   także w celu MonsterASP, gdzie API ma publiczny hostname i topologia
///   niczego nie gwarantuje;
/// - nagłówek ustawia kod serwerowy React Routera z sesji, a żadna trasa
///   zasobowa nie przepuszcza go z żądania przeglądarki. Ten zakaz bramka
///   nie zastępuje: trasa przekazująca nagłówki z przeglądarki doklejałaby
///   do nich sekret i znosiła bramkę od środka;
/// - w celu lokalnym zostaje warstwa dodatkowa: Kestrel nasłuchuje wyłącznie
///   na <c>127.0.0.1:5180</c> (<c>src/Api/appsettings.json</c>), a tunel
///   Cloudflare prowadzi wyłącznie na port 3000, nigdy na port API.
///
/// Na tych samych warunkach stoi <c>/internal/session-signing-key</c>
/// (<c>context/foundation/lessons.md</c>, „Sekrety: konfiguracja .NET…"), i te
/// same zakazy obowiązują dalej: nie wyłączaj bramki ani nie poszerzaj jej
/// wyjątku poza <c>GET /health</c>, nie twórz w React Routerze trasy
/// zasobowej, która przekazuje ten nagłówek (albo dowolne nagłówki) z żądania
/// przeglądarki, a w celu lokalnym nie rozszerzaj nasłuchu Kestrela poza pętlę
/// zwrotną i nie kieruj tunelu na port API. Wyciek sekretu albo złamanie
/// zakazu trasy zamienia nagłówek w podpis, który każdy może podrobić — i daje
/// odczyt oraz zapis cudzego drzewa po samym identyfikatorze konta. Sam
/// identyfikator konta nie jest podpisywany (plan <c>budowa-drzewa</c>, „What
/// We're NOT Doing"); kryptografią jest wyłącznie wspólny sekret wywołującego.
///
/// Identyfikator jest sprawdzany w <c>AspNetUsers</c>, a nie przyjmowany na
/// wiarę: nieistniejące konto skończyłoby się przy zapisie błędem klucza obcego
/// (500) zamiast odpowiedzią w kontrakcie.
/// </remarks>
internal static class TreeIdentity
{
    /// <summary>
    /// Nazwa nagłówka z identyfikatorem konta. Musi być identyczna ze stałą
    /// <c>USER_HEADER</c> klienta API po stronie React Routera
    /// (<c>app/lib/api.server.ts</c>); zgodność jest utrzymywana ręcznie
    /// i przypięta testem.
    /// </summary>
    public const string UserHeader = "X-TreeGrid-User";

    /// <summary>
    /// Jeden komunikat na brak nagłówka, pustą wartość i nieistniejące konto —
    /// rozróżnienie ich niczego klientowi nie daje, a pozwalałoby sprawdzać
    /// istnienie identyfikatorów.
    /// </summary>
    internal const string MissingIdentityMessage = "Brak tożsamości użytkownika.";

    /// <summary>
    /// Identyfikator konta z nagłówka albo <c>null</c>, gdy nagłówka nie ma,
    /// jest pusty, powtórzony albo wskazuje konto, którego nie ma. Na
    /// <c>null</c> endpoint odpowiada <see cref="Refusal"/>.
    /// </summary>
    /// <remarks>
    /// Kilka wartości nagłówka to odmowa, a nie wybór pierwszej: serwer React
    /// Routera wysyła dokładnie jedną, więc każda inna liczba oznacza żądanie
    /// z innego źródła.
    /// </remarks>
    public static async Task<string?> ResolveUserIdAsync(
        HttpRequest request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var values = request.Headers[UserHeader];

        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
        {
            return null;
        }

        var userId = values[0]!;

        var exists = await db.Users
            .AsNoTracking()
            .AnyAsync(user => user.Id == userId, cancellationToken);

        return exists ? userId : null;
    }

    /// <summary>Odpowiedź 401 dla żądania bez rozpoznanej tożsamości.</summary>
    public static IResult Refusal()
        => Results.Json(MissingIdentityError(), statusCode: StatusCodes.Status401Unauthorized);

    /// <summary>
    /// Koperta odmowy — wydzielona z <see cref="Refusal"/>, żeby jej kształt
    /// dało się sprawdzić bez potoku HTTP.
    /// </summary>
    internal static ApiError MissingIdentityError()
        => ApiError.Create(ApiErrorCodes.Unauthorized, MissingIdentityMessage);
}
