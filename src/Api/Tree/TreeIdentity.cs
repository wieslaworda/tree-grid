using Api.Data;
using Api.Errors;
using Microsoft.EntityFrameworkCore;

namespace Api.Tree;

/// <summary>
/// Tożsamość użytkownika dla endpointów <c>/trees</c>: jedyne miejsce, które
/// zamienia nagłówek żądania na identyfikator istniejącego konta albo na
/// odpowiedź 401 w kontrakcie — i jedyne miejsce, w którym zapisany jest model
/// zaufania, na którym ta zamiana stoi.
/// </summary>
/// <remarks>
/// API nie ma uwierzytelniania (<c>UseAuthentication</c>) i nie ma go mieć:
/// sesja żyje po stronie serwera React Routera, a ten wysyła identyfikator
/// zalogowanego konta nagłówkiem <see cref="UserHeader"/>, biorąc go z sesji,
/// nigdy z przeglądarki. Nagłówek jest wiarygodny wyłącznie dlatego, że nikt
/// poza tym serwerem nie może go do API dostarczyć:
///
/// - Kestrel nasłuchuje wyłącznie na <c>127.0.0.1:5180</c>
///   (<c>src/Api/appsettings.json</c>), więc do API dochodzą tylko procesy
///   z tej samej maszyny;
/// - tunel Cloudflare prowadzi wyłącznie na port 3000, czyli do serwera React
///   Routera, nigdy na port API;
/// - nagłówek ustawia kod serwerowy React Routera z sesji, a żadna trasa
///   zasobowa nie przepuszcza go z żądania przeglądarki.
///
/// To te same trzy warunki, na których stoi <c>/internal/session-signing-key</c>
/// (<c>context/foundation/lessons.md</c>, „Sekrety: konfiguracja .NET…"), i te
/// same trzy zakazy: nie rozszerzaj adresu nasłuchu Kestrela poza pętlę
/// zwrotną, nie kieruj tunelu na port API i nie twórz w React Routerze trasy
/// zasobowej, która przekazuje ten nagłówek (albo dowolne nagłówki) z żądania
/// przeglądarki. Złamanie któregokolwiek zamienia nagłówek w podpis, który każdy
/// może podrobić — i daje odczyt oraz zapis cudzego drzewa po samym
/// identyfikatorze konta. Kryptografii w tym przekazaniu świadomie nie ma
/// (plan <c>budowa-drzewa</c>, „What We're NOT Doing").
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
