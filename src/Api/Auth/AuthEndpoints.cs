using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Api.Data;
using Api.Errors;
using Microsoft.AspNetCore.Identity;

namespace Api.Auth;

/// <summary>
/// Endpointy uwierzytelniania. Wydzielone z <c>Program.cs</c>, bo plik startowy
/// opisuje uruchomienie aplikacji, a nie jej reguły — a tych reguł jest tu
/// więcej niż kodu.
///
/// Warstwa jest celowo cienka: wydaje wyłącznie odpowiedzi, nie zakłada sesji
/// i nie ustawia żadnego ciasteczka. Sesja żyje po stronie serwera React
/// Routera (<c>infrastructure.md:81</c>), więc API nie ma tu nic do trzymania.
/// </summary>
internal static class AuthEndpoints
{
    /// <summary>
    /// Ścieżka endpointu wydającego klucz podpisu sesji. Prefiks <c>/internal/</c>
    /// mówi wprost, do czego służy — ale to nie on jest zabezpieczeniem.
    /// </summary>
    private const string SessionSigningKeyPath = "/internal/session-signing-key";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/auth/register", RegisterAsync);
        app.MapPost("/auth/login", LoginAsync);
        app.MapGet(SessionSigningKeyPath, GetSessionSigningKey);

        return app;
    }

    /// <summary>
    /// Zakłada konto po weryfikacji kodu rejestracyjnego. Kod jest jedyną
    /// rzeczą, która odróżnia zaproszonego dyspozytora od przypadkowego gościa,
    /// który trafił pod publiczny adres tunelu — <c>trycloudflare.com</c> nie
    /// obsługuje Cloudflare Access (<c>infrastructure.md:222</c>), więc przed
    /// rejestracją nie stoi żadna inna bramka.
    /// </summary>
    private static async Task<IResult> RegisterAsync(
        RegisterRequest? request,
        UserManager<AppUser> userManager,
        AuthSecrets secrets)
    {
        var email = request?.Email?.Trim() ?? string.Empty;
        var password = request?.Password ?? string.Empty;
        var registrationCode = request?.RegistrationCode ?? string.Empty;

        var fields = new Dictionary<string, string>();

        if (email.Length == 0)
        {
            fields[AuthFormFields.Email] = "Podaj adres e-mail.";
        }

        if (password.Length == 0)
        {
            fields[AuthFormFields.Password] = "Podaj hasło.";
        }

        if (registrationCode.Length == 0)
        {
            fields[AuthFormFields.RegistrationCode] = "Podaj kod rejestracyjny.";
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        // Porównanie odporne na czas: zwykłe porównanie łańcuchów kończy się na
        // pierwszym różniącym się znaku, więc czas odpowiedzi rośnie razem
        // z długością trafionego prefiksu i kod daje się odgadywać pomiarem,
        // znak po znaku. FixedTimeEquals przechodzi całą długość zawsze.
        if (!FixedTimeMatches(secrets.RequireRegistrationCode(), registrationCode))
        {
            fields[AuthFormFields.RegistrationCode] = "Nieprawidłowy kod rejestracyjny.";

            return ValidationFailure(fields);
        }

        // Adres e-mail jest identyfikatorem logowania (PRD FR-001), więc jest
        // jednocześnie nazwą użytkownika — konto z inną nazwą nie miałoby
        // w tej aplikacji jak powstać ani po czym być znalezione.
        var user = new AppUser { UserName = email, Email = email };
        var result = await userManager.CreateAsync(user, password);

        if (!result.Succeeded)
        {
            return ValidationFailure(
                TranslateIdentityErrors(result.Errors, userManager.Options.Password.RequiredLength));
        }

        return Results.Ok(AccountResponse(user));
    }

    /// <summary>
    /// Weryfikuje poświadczenia i prowadzi licznik nieudanych prób. To jedyne
    /// miejsce w aplikacji, w którym da się zgadywać hasło.
    /// </summary>
    /// <remarks>
    /// Kolejność wywołań <c>UserManager</c> jest wymuszona i nie wolno jej
    /// zmieniać. <c>AddIdentityCore</c> nie prowadzi blokady konta za nas —
    /// robi to zwykle <c>SignInManager.PasswordSignInAsync</c>, którego ten
    /// projekt świadomie nie ma, bo wymagałby zarejestrowanych schematów
    /// uwierzytelniania kolidujących z sesją po stronie React Routera. Stąd
    /// ręczna sekwencja: <c>IsLockedOutAsync</c> przed weryfikacją hasła,
    /// potem <c>CheckPasswordAsync</c> (które samo z siebie nie dotyka
    /// licznika), a na końcu — zależnie od wyniku — <c>AccessFailedAsync</c>
    /// albo <c>ResetAccessFailedCountAsync</c>.
    /// </remarks>
    private static async Task<IResult> LoginAsync(
        LoginRequest? request,
        UserManager<AppUser> userManager)
    {
        var email = request?.Email?.Trim() ?? string.Empty;
        var password = request?.Password ?? string.Empty;

        var fields = new Dictionary<string, string>();

        if (email.Length == 0)
        {
            fields[AuthFormFields.Email] = "Podaj adres e-mail.";
        }

        if (password.Length == 0)
        {
            fields[AuthFormFields.Password] = "Podaj hasło.";
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var user = await userManager.FindByEmailAsync(email);

        if (user is null)
        {
            // Ta sama odpowiedź, co przy złym haśle — patrz
            // AuthResponses.DescribeLoginFailure. Różnica w czasie odpowiedzi
            // pozostaje możliwym kanałem obserwacji (tutaj nie liczy się żaden
            // hasz); zamyka ją dopiero ograniczenie tempa prób, którego ten
            // plaster nie wprowadza.
            return LoginFailureResult(LoginOutcome.UserNotFound, lockoutEnd: null);
        }

        if (await userManager.IsLockedOutAsync(user))
        {
            return LoginFailureResult(
                LoginOutcome.LockedOut,
                await userManager.GetLockoutEndDateAsync(user));
        }

        if (!await userManager.CheckPasswordAsync(user, password))
        {
            await userManager.AccessFailedAsync(user);

            // Próba, która właśnie przekroczyła próg, od razu mówi o blokadzie.
            // Odłożenie tego do następnego podejścia kazałoby użytkownikowi
            // zgadywać, czy dalsze próby mają sens — a to jedyny powód, dla
            // którego blokada ma w ogóle własny kod błędu.
            return await userManager.IsLockedOutAsync(user)
                ? LoginFailureResult(
                    LoginOutcome.LockedOut,
                    await userManager.GetLockoutEndDateAsync(user))
                : LoginFailureResult(LoginOutcome.WrongPassword, lockoutEnd: null);
        }

        // Bez wyzerowania licznik nigdy nie wraca do zera: kolejne pojedyncze
        // pomyłki, rozłożone choćby na tygodnie, zsumują się do progu i konto
        // zablokuje się samo z siebie, bez żadnego ataku.
        await userManager.ResetAccessFailedCountAsync(user);

        return Results.Ok(AccountResponse(user));
    }

    /// <summary>
    /// Wydaje serwerowi React Routera klucz, którym podpisuje ciasteczko sesji.
    /// Endpoint zwraca wyłącznie ten klucz i nic więcej.
    /// </summary>
    /// <remarks>
    /// Bezpieczeństwo tego endpointu opiera się w całości na tym, że Kestrel
    /// nasłuchuje wyłącznie na <c>127.0.0.1:5180</c>
    /// (<c>src/Api/appsettings.json</c>) i że tunelowany jest wyłącznie port
    /// 3000 (<c>.claude/skills/run-tunel-app/SKILL.md:262-277</c>) — nie na
    /// tym, że ścieżki nikt nie zgadnie. Wystarczy złamać jeden z tych dwóch
    /// warunków: zmienić adres nasłuchu Kestrela na taki, który obejmuje kartę
    /// sieciową, albo skierować tunel na port API — i endpoint staje się
    /// publicznym wyciekiem klucza podpisu, czyli wystawia każdemu możliwość
    /// podrobienia dowolnej sesji. Z tego samego powodu nie wolno tworzyć dla
    /// niego trasy zasobowej w React Routerze: byłaby tunelem do sekretu.
    /// </remarks>
    private static IResult GetSessionSigningKey(HttpContext context, AuthSecrets secrets)
    {
        // Klucz nie ma prawa osiąść w żadnym buforze po drodze.
        context.Response.Headers.CacheControl = "no-store";

        return Results.Ok(new { key = secrets.RequireSessionSigningKey() });
    }

    /// <summary>
    /// Odpowiedź o koncie: identyfikator i adres e-mail. Nigdy hasło ani hasz —
    /// a żeby nie dało się ich tu dopisać przez przeoczenie, odpowiedź powstaje
    /// w jednym miejscu dla obu endpointów.
    /// </summary>
    private static object AccountResponse(AppUser user)
        => new { id = user.Id, email = user.Email };

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    private static IResult LoginFailureResult(LoginOutcome outcome, DateTimeOffset? lockoutEnd)
    {
        var failure = AuthResponses.DescribeLoginFailure(outcome, lockoutEnd);

        return Results.Json(failure.Error, statusCode: failure.StatusCode);
    }

    private static bool FixedTimeMatches(string expected, string provided)
        => CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(provided));

    /// <summary>
    /// Zamienia błędy Identity na mapę „pole → komunikat". Opis własny Identity
    /// jest angielski, a komunikaty w tej aplikacji są polskie
    /// (<c>ConfigProvider</c> z <c>pl_PL</c> w <c>app/root.tsx</c>), więc
    /// przepuszczany jest kod błędu, nie tekst.
    /// </summary>
    private static Dictionary<string, string> TranslateIdentityErrors(
        IEnumerable<IdentityError> errors,
        int requiredPasswordLength)
    {
        var fields = new Dictionary<string, string>();

        foreach (var error in errors)
        {
            var (field, message) = error.Code switch
            {
                "DuplicateUserName" or "DuplicateEmail" => (
                    AuthFormFields.Email,
                    "Konto o tym adresie e-mail już istnieje."),
                "InvalidUserName" or "InvalidEmail" => (
                    AuthFormFields.Email,
                    "Podaj poprawny adres e-mail."),
                "PasswordTooShort" => (
                    AuthFormFields.Password,
                    $"Hasło musi mieć co najmniej {requiredPasswordLength} znaków."),
                "PasswordRequiresDigit" => (
                    AuthFormFields.Password,
                    "Hasło musi zawierać cyfrę."),
                "PasswordRequiresLower" => (
                    AuthFormFields.Password,
                    "Hasło musi zawierać małą literę."),
                "PasswordRequiresUpper" => (
                    AuthFormFields.Password,
                    "Hasło musi zawierać wielką literę."),
                "PasswordRequiresNonAlphanumeric" => (
                    AuthFormFields.Password,
                    "Hasło musi zawierać znak specjalny."),
                "PasswordRequiresUniqueChars" => (
                    AuthFormFields.Password,
                    "Hasło musi zawierać więcej różnych znaków."),
                _ => (
                    AuthFormFields.Form,
                    "Nie udało się założyć konta."),
            };

            // Pierwsze naruszenie pola wygrywa: formularz pokazuje pod polem
            // jeden komunikat, a sklejanie kilku daje tekst, którego nikt nie
            // czyta do końca.
            fields.TryAdd(field, message);
        }

        return fields;
    }
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>).
/// </summary>
/// <remarks>
/// Muszą być identyczne z nazwami pól formularzy po stronie React Routera
/// (<c>app/routes/logowanie.tsx</c>, <c>app/routes/rejestracja.tsx</c>). To
/// jedyne miejsce w projekcie, w którym zgodność między dwiema stronami granicy
/// jest utrzymywana ręcznie: nie sprawdza jej ani kompilator, ani
/// <c>npm run typecheck</c>, a rozjazd nie daje żadnego błędu — komunikat po
/// prostu nie pojawia się przy polu, którego dotyczy.
/// </remarks>
internal static class AuthFormFields
{
    public const string Email = "email";

    public const string Password = "password";

    public const string RegistrationCode = "registrationCode";

    /// <summary>
    /// Pole zbiorcze na naruszenia, które nie dotyczą żadnego konkretnego pola
    /// formularza. Istnieje, żeby mapa naruszeń nigdy nie wyszła pusta — pusty
    /// <c>fields</c> zostawiłby użytkownika z błędem bez treści.
    /// </summary>
    public const string Form = "form";
}

/// <summary>
/// Wynik weryfikacji poświadczeń, oddzielony od odpowiedzi. Rozdzielenie jest
/// tym, co czyni regułę „nieistniejące konto i złe hasło wyglądają identycznie"
/// sprawdzalną w teście jednostkowym, bez podnoszenia hosta.
/// </summary>
internal enum LoginOutcome
{
    UserNotFound,
    WrongPassword,
    LockedOut,
}

/// <summary>Status HTTP i koperta błędu dla nieudanego logowania.</summary>
internal readonly record struct LoginFailure(int StatusCode, ApiError Error);

/// <summary>
/// Odpowiedzi błędne logowania. Wydzielone z <see cref="AuthEndpoints"/>, bo
/// reguła „obie porażki wyglądają tak samo" ma być sprawdzalna bez potoku HTTP.
/// </summary>
internal static class AuthResponses
{
    /// <summary>
    /// Jeden komunikat na oba przypadki nieudanych poświadczeń. Gdyby różniły
    /// się choćby słowem, istnienie adresu e-mail dałoby się sprawdzić bez
    /// znajomości hasła, a lista kont dyspozytorów jest z punktu widzenia
    /// atakującego pierwszym łupem.
    /// </summary>
    internal const string InvalidCredentialsMessage = "Nieprawidłowy adres e-mail lub hasło.";

    internal const string AccountLockedMessage =
        "Konto zostało tymczasowo zablokowane po kolejnych nieudanych próbach logowania.";

    /// <summary>Klucz w <c>context</c> z momentem wygaśnięcia blokady.</summary>
    internal const string LockoutEndContextKey = "lockoutEnd";

    /// <summary>
    /// Odwzorowuje wynik weryfikacji na odpowiedź.
    /// <see cref="LoginOutcome.UserNotFound"/> i
    /// <see cref="LoginOutcome.WrongPassword"/> muszą dawać ten sam status, ten
    /// sam kod i ten sam komunikat — dlatego dzielą jedną gałąź, a nie dwie
    /// o identycznej treści.
    /// </summary>
    public static LoginFailure DescribeLoginFailure(LoginOutcome outcome, DateTimeOffset? lockoutEnd)
        => outcome switch
        {
            LoginOutcome.UserNotFound or LoginOutcome.WrongPassword => new LoginFailure(
                StatusCodes.Status401Unauthorized,
                ApiError.Create(ApiErrorCodes.Unauthorized, InvalidCredentialsMessage)),

            // 423 zamiast 401: żądanie nie zostało odrzucone przez poświadczenia,
            // tylko przez stan konta, a klient ma powód rozróżnić te dwie
            // sytuacje bez zaglądania w treść.
            LoginOutcome.LockedOut => new LoginFailure(
                StatusCodes.Status423Locked,
                ApiError.Create(
                    ApiErrorCodes.AccountLocked,
                    AccountLockedMessage,
                    new Dictionary<string, object?>
                    {
                        // Format okrągły ISO 8601 ze strefą — moment jest
                        // przeznaczony do odczytu maszynowego, a formatowanie
                        // po polsku należy do warstwy widoku.
                        [LockoutEndContextKey] = lockoutEnd?.ToString("O", CultureInfo.InvariantCulture),
                    })),

            _ => throw new ArgumentOutOfRangeException(nameof(outcome), outcome, null),
        };
}

/// <summary>
/// Treść żądania rejestracji. Pola są nullowalne, żeby ich brak dawał błąd
/// walidacji w kontrakcie, a nie błąd wiązania w kształcie frameworka.
/// </summary>
internal sealed record RegisterRequest(string? Email, string? Password, string? RegistrationCode);

/// <summary>Treść żądania logowania.</summary>
internal sealed record LoginRequest(string? Email, string? Password);
