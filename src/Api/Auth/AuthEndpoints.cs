using System.Globalization;
using Api.Data;
using Api.Errors;
using Api.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

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
/// <remarks>
/// Rejestracja idzie w dwóch krokach (S-14, FR-001 w wersji z 2026-10-10).
/// Krok 1 zakłada oczekującą rejestrację (<see cref="PendingRegistration"/>)
/// i wysyła jednorazowy kod administratorowi; krok 2 zakłada konto dopiero po
/// poprawnym kodzie. Kod jest jedyną rzeczą, która odróżnia osobę przyjętą
/// przez administratora od przypadkowego gościa, który trafił pod publiczny
/// adres tunelu — <c>trycloudflare.com</c> nie obsługuje Cloudflare Access
/// (<c>infrastructure.md:222</c>), więc przed rejestracją nie stoi żadna inna
/// bramka.
///
/// Zapisy otwierają transakcję <b>przed</b> pierwszym odczytem stanu, na którym
/// opierają decyzję — na SQLite to <c>BEGIN IMMEDIATE</c>, więc dwa równoległe
/// kroki 1 z tym samym loginem albo dwie równoległe próby kodu czekają na
/// siebie (<c>busy_timeout</c> z <c>Program.cs</c>), zamiast czytać ten sam
/// stan (wzorem <c>ObjectEndpoints</c>). Wyjście bez <c>Commit</c> wycofuje
/// transakcję przy jej zwolnieniu.
/// </remarks>
internal static class AuthEndpoints
{
    /// <summary>
    /// Nazwa polityki limitu tempa kroku 1. Politykę rejestruje
    /// <c>Program.cs</c> (<c>AddRateLimiter</c>), a przypięta jest wyłącznie
    /// do <c>POST /auth/register</c> — to jedyny endpoint, który wysyła pocztę.
    /// </summary>
    internal const string RegistrationRateLimitPolicy = "registration";

    /// <summary>
    /// Ścieżka endpointu wydającego klucz podpisu sesji. Prefiks <c>/internal/</c>
    /// mówi wprost, do czego służy — ale to nie on jest zabezpieczeniem.
    /// </summary>
    private const string SessionSigningKeyPath = "/internal/session-signing-key";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/auth/register", RegisterAsync)
            .RequireRateLimiting(RegistrationRateLimitPolicy);
        app.MapPost("/auth/register/confirm", ConfirmRegistrationAsync);
        app.MapPost("/auth/login", LoginAsync);
        app.MapGet(SessionSigningKeyPath, GetSessionSigningKey);

        return app;
    }

    /// <summary>
    /// Krok 1 rejestracji: rezerwuje login i adres e-mail, zapisuje oczekującą
    /// rejestrację i wysyła kod administratorowi. Konto jeszcze nie powstaje.
    /// </summary>
    /// <remarks>
    /// Kolejność jest wymuszona. Najpierw walidacja i rezerwacja zapisana
    /// z commitem, dopiero potem wysyłka — poza transakcją, bo SMTP trwa
    /// sekundy, a trzymanie blokady zapisu SQLite przez ten czas zderzyłoby
    /// się z <c>busy_timeout</c> każdego innego zapisu. Porażka wysyłki usuwa
    /// wiersz, więc wniosek, o którym administrator się nie dowiedział, nie
    /// trzyma loginu przez dobę.
    ///
    /// Hasła i kodu nie ma w żadnym logu ani w <c>context</c> koperty: w bazie
    /// leżą wyłącznie ich hasze, a kod jawny istnieje tylko w pamięci tego
    /// żądania i w wysłanej wiadomości.
    /// </remarks>
    private static async Task<IResult> RegisterAsync(
        RegisterRequest? request,
        UserManager<AppUser> userManager,
        AppDbContext db,
        IVerificationMailSender mailSender,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var login = request?.Login?.Trim() ?? string.Empty;
        var email = request?.Email?.Trim() ?? string.Empty;
        var password = request?.Password ?? string.Empty;

        var fields = RegistrationRules.ValidateRegistration(login, email, password);

        // Walidatory hasła trzeba wywołać jawnie: krok 2 zakłada konto przez
        // `CreateAsync(user)` z gotowym haszem, a ta ścieżka ich nie uruchamia.
        // Słabe hasło ma więc odpaść tutaj, zanim pójdzie wiadomość.
        var candidate = new AppUser { UserName = login, Email = email };

        if (password.Length > 0)
        {
            foreach (var validator in userManager.PasswordValidators)
            {
                var result = await validator.ValidateAsync(userManager, candidate, password);

                if (!result.Succeeded)
                {
                    foreach (var (field, message) in TranslateIdentityErrors(
                        result.Errors, userManager.Options.Password.RequiredLength))
                    {
                        fields.TryAdd(field, message);
                    }
                }
            }
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var code = RegistrationRules.GenerateCode();
        var now = DateTimeOffset.UtcNow;

        // Hasze przed transakcją: PBKDF2 kosztuje kilkadziesiąt milisekund,
        // a blokada zapisu nie ma ich na co czekać.
        var registration = new PendingRegistration
        {
            UserName = login,
            NormalizedUserName = userManager.NormalizeName(login),
            Email = email,
            NormalizedEmail = userManager.NormalizeEmail(email),
            PasswordHash = userManager.PasswordHasher.HashPassword(candidate, password),
            CodeHash = userManager.PasswordHasher.HashPassword(candidate, code),
            CreatedAt = now,
            ExpiresAt = now + RegistrationRules.CodeLifetime,
        };

        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            // Wiersze wczytywane w całości, a wygasłe odsiewane w pamięci:
            // dostawca SQLite nie tłumaczy porównań `DateTimeOffset` na SQL.
            // Tabela jest mała z założenia — limit tempa kroku 1 i doba
            // ważności trzymają ją w setkach wierszy najwyżej.
            var pending = await db.PendingRegistrations.ToListAsync(cancellationToken);
            var expired = pending.Where(row => RegistrationRules.IsExpired(row.ExpiresAt, now)).ToList();

            // Sprzątanie leniwe, przed sprawdzeniem unikalności — wygasła
            // rezerwacja nie zajmuje loginu ani adresu.
            db.PendingRegistrations.RemoveRange(expired);

            var live = pending.Except(expired).ToList();

            // Zajętość przez konto i przez niewygasłą rejestrację daje ten sam
            // komunikat: rozróżnienie mówiłoby, że ktoś właśnie czeka na kod.
            if (await userManager.FindByNameAsync(login) is not null
                || live.Any(row => row.NormalizedUserName == registration.NormalizedUserName))
            {
                fields[AuthFormFields.Login] = AuthResponses.LoginTakenMessage;
            }

            if (await userManager.FindByEmailAsync(email) is not null
                || live.Any(row => row.NormalizedEmail == registration.NormalizedEmail))
            {
                fields[AuthFormFields.Email] = AuthResponses.EmailTakenMessage;
            }

            if (fields.Count == 0)
            {
                db.PendingRegistrations.Add(registration);
            }

            // Zatwierdzane także przy odmowie — wtedy niesie samo sprzątanie.
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        try
        {
            await mailSender.SendVerificationCodeAsync(
                registration.UserName,
                registration.Email,
                code,
                registration.ExpiresAt,
                cancellationToken);
        }
        catch (Exception exception)
        {
            // Wpis bez loginu, adresu i kodu: wyjątek transportu mówi, co
            // zawiodło (serwer, uwierzytelnienie, katalog), a reszta nie jest
            // do tego potrzebna. Poziom Error, więc wpis trafia do pliku logu.
            loggerFactory.CreateLogger(typeof(AuthEndpoints)).LogError(
                exception,
                "Nie udało się wysłać kodu weryfikacyjnego administratorowi. " +
                "Oczekująca rejestracja została usunięta.");

            // Bez tokenu żądania: rozłączony klient nie może zostawić
            // rezerwacji, o której administrator się nie dowie.
            await db.PendingRegistrations
                .Where(row => row.Id == registration.Id)
                .ExecuteDeleteAsync(CancellationToken.None);

            return Results.Json(
                AuthResponses.MailUnavailable(),
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        // 202, a nie 201: konto jeszcze nie istnieje — przyjęty jest wniosek.
        return Results.Json(
            new { login = registration.UserName, expiresAt = registration.ExpiresAt },
            statusCode: StatusCodes.Status202Accepted);
    }

    /// <summary>
    /// Krok 2 rejestracji: poprawny kod w terminie zamienia oczekującą
    /// rejestrację w konto. Rejestracja jest wskazywana loginem, bo login jest
    /// zarezerwowany na czas jej ważności.
    /// </summary>
    /// <remarks>
    /// Kolejność: odczyt po loginie, termin, dopiero potem kod — termin wygrywa
    /// z poprawnym kodem (<see cref="RegistrationRules.Evaluate"/>). Zły kod
    /// zwiększa licznik, a ten, który wyczerpuje limit, usuwa wiersz. Brak
    /// wiersza, termin i wyczerpany limit dają jedną odpowiedź na polu
    /// <c>form</c>: w każdym z tych przypadków jedyną drogą jest ponowny krok 1.
    /// </remarks>
    private static async Task<IResult> ConfirmRegistrationAsync(
        ConfirmRegistrationRequest? request,
        UserManager<AppUser> userManager,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var login = request?.Login?.Trim() ?? string.Empty;
        var code = request?.Code?.Trim() ?? string.Empty;

        var fields = new Dictionary<string, string>();

        if (login.Length == 0)
        {
            fields[AuthFormFields.Login] = RegistrationRules.MissingLoginMessage;
        }

        if (code.Length == 0)
        {
            fields[AuthFormFields.Code] = AuthResponses.MissingCodeMessage;
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var normalizedLogin = userManager.NormalizeName(login);
        var now = DateTimeOffset.UtcNow;

        // Przed pierwszym odczytem — patrz komentarz klasy. Licznik prób jest
        // tu stanem, o który dwie równoległe próby mogłyby się ścigać.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var registration = await db.PendingRegistrations
            .SingleOrDefaultAsync(row => row.NormalizedUserName == normalizedLogin, cancellationToken);

        if (registration is null)
        {
            return RegistrationGone();
        }

        // Kod sprawdzany wyłącznie w terminie; weryfikacja hasza przez
        // `IPasswordHasher` porównuje w stałym czasie.
        var codeMatches = !RegistrationRules.IsExpired(registration.ExpiresAt, now)
            && userManager.PasswordHasher.VerifyHashedPassword(
                new AppUser { UserName = registration.UserName, Email = registration.Email },
                registration.CodeHash,
                code) != PasswordVerificationResult.Failed;

        switch (RegistrationRules.Evaluate(registration.ExpiresAt, registration.FailedAttempts, codeMatches, now))
        {
            case ConfirmOutcome.WrongCode:
                registration.FailedAttempts++;

                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                fields[AuthFormFields.Code] = AuthResponses.WrongCodeMessage;

                return ValidationFailure(fields);

            case ConfirmOutcome.Expired:
            case ConfirmOutcome.AttemptsExhausted:
                db.PendingRegistrations.Remove(registration);

                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                return RegistrationGone();
        }

        // Konto z haszem hasła z kroku 1 — `CreateAsync(user)` bez hasła
        // waliduje login i adres (w tym unikalność) i ustawia znacznik
        // bezpieczeństwa, ale hasza nie dotyka. Ten sam kontekst co wiersz
        // rejestracji, więc konto i usunięcie wiersza zapisują się w jednej
        // transakcji.
        var user = new AppUser
        {
            UserName = registration.UserName,
            Email = registration.Email,
            PasswordHash = registration.PasswordHash,
        };

        var created = await userManager.CreateAsync(user);

        // Usunięcie wiersza w obu przypadkach. Porażka tutaj to konto założone
        // w międzyczasie z tym samym loginem albo adresem — taka rejestracja
        // nie ma już szans się udać, więc nie ma też czego rezerwować.
        db.PendingRegistrations.Remove(registration);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        if (!created.Succeeded)
        {
            // Formularz kroku 2 ma tylko login i kod, więc naruszenie każdego
            // innego pola idzie na pole zbiorcze.
            var translated = TranslateIdentityErrors(
                created.Errors, userManager.Options.Password.RequiredLength);

            foreach (var (field, message) in translated)
            {
                fields.TryAdd(field == AuthFormFields.Login ? field : AuthFormFields.Form, message);
            }

            return ValidationFailure(fields);
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
    ///
    /// Identyfikatorem logowania jest login (<c>UserName</c>). Konta sprzed
    /// S-14 mają login równy adresowi e-mail, więc logują się adresem wpisanym
    /// w pole loginu.
    /// </remarks>
    private static async Task<IResult> LoginAsync(
        LoginRequest? request,
        UserManager<AppUser> userManager)
    {
        var login = request?.Login?.Trim() ?? string.Empty;
        var password = request?.Password ?? string.Empty;

        var fields = new Dictionary<string, string>();

        if (login.Length == 0)
        {
            fields[AuthFormFields.Login] = RegistrationRules.MissingLoginMessage;
        }

        if (password.Length == 0)
        {
            fields[AuthFormFields.Password] = RegistrationRules.MissingPasswordMessage;
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var user = await userManager.FindByNameAsync(login);

        if (user is null)
        {
            // Ta sama odpowiedź, co przy złym haśle — patrz
            // AuthResponses.DescribeLoginFailure. Różnica w czasie odpowiedzi
            // pozostaje możliwym kanałem obserwacji (tutaj nie liczy się żaden
            // hasz); zamyka ją dopiero ograniczenie tempa prób logowania,
            // którego API nie ma — limit tempa obejmuje wyłącznie krok 1
            // rejestracji.
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
    /// Odpowiedź o koncie: identyfikator, login i adres e-mail. Nigdy hasło ani
    /// hasz — a żeby nie dało się ich tu dopisać przez przeoczenie, odpowiedź
    /// powstaje w jednym miejscu dla obu endpointów, które ją wydają.
    /// </summary>
    private static object AccountResponse(AppUser user)
        => new { id = user.Id, login = user.UserName, email = user.Email };

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    /// <summary>Odmowa kroku 2, po której jedyną drogą jest ponowny krok 1.</summary>
    private static IResult RegistrationGone()
        => ValidationFailure(new Dictionary<string, string>
        {
            [AuthFormFields.Form] = AuthResponses.RegistrationGoneMessage,
        });

    private static IResult LoginFailureResult(LoginOutcome outcome, DateTimeOffset? lockoutEnd)
    {
        var failure = AuthResponses.DescribeLoginFailure(outcome, lockoutEnd);

        return Results.Json(failure.Error, statusCode: failure.StatusCode);
    }

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
                "DuplicateUserName" => (
                    AuthFormFields.Login,
                    AuthResponses.LoginTakenMessage),
                "DuplicateEmail" => (
                    AuthFormFields.Email,
                    AuthResponses.EmailTakenMessage),
                "InvalidUserName" => (
                    AuthFormFields.Login,
                    RegistrationRules.LoginCharactersMessage),
                "InvalidEmail" => (
                    AuthFormFields.Email,
                    RegistrationRules.InvalidEmailMessage),
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
/// (<c>app/routes/logowanie.tsx</c>, <c>app/routes/rejestracja.tsx</c>,
/// <c>app/routes/rejestracja-potwierdzenie.tsx</c>). To jedyne miejsce
/// w projekcie, w którym zgodność między dwiema stronami granicy jest
/// utrzymywana ręcznie: nie sprawdza jej ani kompilator, ani
/// <c>npm run typecheck</c>, a rozjazd nie daje żadnego błędu — komunikat po
/// prostu nie pojawia się przy polu, którego dotyczy.
/// </remarks>
internal static class AuthFormFields
{
    /// <summary>Login — identyfikator logowania i klucz oczekującej rejestracji.</summary>
    public const string Login = "login";

    public const string Email = "email";

    public const string Password = "password";

    /// <summary>Kod weryfikacyjny w kroku 2 rejestracji.</summary>
    public const string Code = "code";

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
/// Odpowiedzi błędne uwierzytelniania. Wydzielone z <see cref="AuthEndpoints"/>,
/// bo reguła „obie porażki logowania wyglądają tak samo" i kształt kopert
/// rejestracji mają być sprawdzalne bez potoku HTTP.
/// </summary>
internal static class AuthResponses
{
    /// <summary>
    /// Jeden komunikat na oba przypadki nieudanych poświadczeń. Gdyby różniły
    /// się choćby słowem, istnienie loginu dałoby się sprawdzić bez znajomości
    /// hasła, a lista kont dyspozytorów jest z punktu widzenia atakującego
    /// pierwszym łupem.
    /// </summary>
    internal const string InvalidCredentialsMessage = "Nieprawidłowy login lub hasło.";

    internal const string AccountLockedMessage =
        "Konto zostało tymczasowo zablokowane po kolejnych nieudanych próbach logowania.";

    /// <summary>Klucz w <c>context</c> z momentem wygaśnięcia blokady.</summary>
    internal const string LockoutEndContextKey = "lockoutEnd";

    /// <summary>Login zajęty przez konto albo przez niewygasłą rejestrację — jeden komunikat na oba.</summary>
    internal const string LoginTakenMessage = "Ten login jest już zajęty.";

    /// <summary>Adres zajęty przez konto albo przez niewygasłą rejestrację — jeden komunikat na oba.</summary>
    internal const string EmailTakenMessage = "Konto o tym adresie e-mail już istnieje.";

    internal const string MissingCodeMessage = "Podaj kod weryfikacyjny.";

    internal const string WrongCodeMessage = "Nieprawidłowy kod weryfikacyjny.";

    /// <summary>Brak rejestracji, termin albo wyczerpany limit prób — jeden komunikat na wszystkie.</summary>
    internal const string RegistrationGoneMessage =
        "Rejestracja wygasła albo nie istnieje. Wypełnij formularz rejestracji ponownie.";

    internal const string RateLimitedMessage =
        "Zbyt wiele prób rejestracji w krótkim czasie. Spróbuj ponownie później.";

    internal const string MailUnavailableMessage =
        "Nie udało się wysłać kodu weryfikacyjnego. Spróbuj ponownie później.";

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

    /// <summary>
    /// Koperta odmowy limitu tempa kroku 1 (429). Pisze ją <c>OnRejected</c>
    /// limitera w <c>Program.cs</c>, bo żądanie odrzucone limitem do endpointu
    /// nie dochodzi. <c>context</c> jest pusty.
    /// </summary>
    public static ApiError RateLimited()
        => ApiError.Create(ApiErrorCodes.RateLimited, RateLimitedMessage);

    /// <summary>Koperta porażki wysyłki kodu (503). <c>context</c> jest pusty — przyczyna zostaje w logu.</summary>
    public static ApiError MailUnavailable()
        => ApiError.Create(ApiErrorCodes.MailUnavailable, MailUnavailableMessage);
}

/// <summary>
/// Treść żądania kroku 1 rejestracji. Pola są nullowalne, żeby ich brak dawał
/// błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie frameworka.
/// </summary>
internal sealed record RegisterRequest(string? Login, string? Email, string? Password);

/// <summary>Treść żądania kroku 2 rejestracji.</summary>
internal sealed record ConfirmRegistrationRequest(string? Login, string? Code);

/// <summary>Treść żądania logowania.</summary>
internal sealed record LoginRequest(string? Login, string? Password);
