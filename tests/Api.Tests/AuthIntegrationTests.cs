using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Api.Data;
using Api.Errors;
using Api.Mail;
using Microsoft.EntityFrameworkCore;

namespace Api.Tests;

/// <summary>
/// Bariera dostępu za tunelem (S-14, FR-001 w wersji z 2026-10-10) na
/// prawdziwym potoku HTTP i SQLite: rejestracja w dwóch krokach z kodem
/// weryfikacyjnym wysyłanym administratorowi, rezerwacja loginu i adresu,
/// limit prób kodu, wygaśnięcie, limit tempa kroku 1, porażka wysyłki
/// i logowanie loginem.
///
/// Wyrocznią są PRD i plan <c>context/changes/zakladanie-konta/plan.md</c>
/// („Testing Strategy"), nie kod pod testem: komunikaty, limity i statusy są
/// wpisane w testach. Kod weryfikacyjny jest czytany z pliku <c>.eml</c>
/// w katalogu fabryki (<see cref="TestApiFactory.ReadLastVerificationCode"/>),
/// tak jak przeczytałby go administrator. Stan bazy jest odczytywany wprost
/// z tabeli, nowym scope.
///
/// Testy w klasie dzielą jeden host i plik bazy, więc każdy używa własnego,
/// losowego loginu i adresu. Limit tempa i porażka wysyłki mają własne hosty
/// (<see cref="RateLimitedApiFactory"/>, <see cref="FailingMailApiFactory"/>),
/// bo oba zmieniają zachowanie całego hosta.
/// </summary>
public class AuthIntegrationTests(
    TestApiFactory factory,
    AuthIntegrationTests.RateLimitedApiFactory rateLimitedFactory,
    AuthIntegrationTests.FailingMailApiFactory failingMailFactory)
    : IClassFixture<TestApiFactory>,
        IClassFixture<AuthIntegrationTests.RateLimitedApiFactory>,
        IClassFixture<AuthIntegrationTests.FailingMailApiFactory>
{
    /// <summary>Hasło spełniające reguły złożoności Identity z <c>Program.cs</c>.</summary>
    private const string Password = "Haslo-Testowe-1";

    private const string LoginTaken = "Ten login jest już zajęty.";

    private const string EmailTaken = "Konto o tym adresie e-mail już istnieje.";

    private const string WrongCode = "Nieprawidłowy kod weryfikacyjny.";

    private const string RegistrationGone =
        "Rejestracja wygasła albo nie istnieje. Wypełnij formularz rejestracji ponownie.";

    // --- Szczęśliwa ścieżka -------------------------------------------------

    [Fact]
    public async Task Registration_with_the_mailed_code_creates_the_account_and_the_login_signs_in()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();
        var email = EmailFor(login);

        var registered = await RegisterAsync(client, login, email);

        Assert.Equal(HttpStatusCode.Accepted, registered.StatusCode);
        var accepted = await registered.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(login, accepted.GetProperty("login").GetString());
        var expiresAt = accepted.GetProperty("expiresAt").GetDateTimeOffset();
        Assert.InRange(
            expiresAt - DateTimeOffset.UtcNow,
            TimeSpan.FromHours(24) - TimeSpan.FromMinutes(5),
            TimeSpan.FromHours(24));

        var code = factory.ReadLastVerificationCode(login);

        var confirmed = await ConfirmAsync(client, login, code);

        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        var account = await confirmed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrEmpty(account.GetProperty("id").GetString()));
        Assert.Equal(login, account.GetProperty("login").GetString());
        Assert.Equal(email, account.GetProperty("email").GetString());

        var signedIn = await LoginAsync(client, login, Password);

        Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);
        var session = await signedIn.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(account.GetProperty("id").GetString(), session.GetProperty("id").GetString());
        Assert.Equal(login, session.GetProperty("login").GetString());

        Assert.Null(await ReadPendingAsync(factory, login));
    }

    [Fact]
    public async Task Mailed_message_names_the_login_and_the_applicant_email()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();
        var email = EmailFor(login);

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);

        var code = factory.ReadLastVerificationCode(login);
        var text = ReadMailText(factory, login);

        Assert.Contains($"Login: {login}", text);
        Assert.Contains($"Adres e-mail: {email}", text);
        Assert.Contains($"Kod weryfikacyjny: {code}", text);
    }

    [Fact]
    public async Task Account_does_not_exist_before_the_code_is_confirmed()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, EmailFor(login))).StatusCode);

        var response = await LoginAsync(client, login, Password);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Unauthorized, ApiErrorCodes.Unauthorized);
        Assert.NotNull(await ReadPendingAsync(factory, login));
    }

    [Fact]
    public async Task Weak_password_is_refused_in_step_one_without_a_message_or_a_reservation()
    {
        // Krok 2 zakłada konto bez uruchamiania walidatorów hasła, więc słabe
        // hasło musi odpaść tutaj.
        using var client = factory.CreateClient();
        var login = NewLogin();

        var response = await RegisterAsync(client, login, EmailFor(login), password: "krotkie");

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.True(Fields(error).TryGetProperty("password", out _));
        Assert.Null(await ReadPendingAsync(factory, login));
    }

    // --- Rezerwacja ---------------------------------------------------------

    [Fact]
    public async Task Pending_login_is_reserved_regardless_of_letter_case()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, EmailFor(login))).StatusCode);

        var response = await RegisterAsync(client, login.ToUpperInvariant(), EmailFor(NewLogin()));

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(LoginTaken, Fields(error).GetProperty("login").GetString());
    }

    [Fact]
    public async Task Pending_email_is_reserved()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();
        var email = EmailFor(login);

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);

        var response = await RegisterAsync(client, NewLogin(), email.ToUpperInvariant());

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(EmailTaken, Fields(error).GetProperty("email").GetString());
    }

    [Fact]
    public async Task Login_equal_to_the_email_login_of_an_existing_account_is_taken()
    {
        using var client = factory.CreateClient();
        var existing = await IntegrationSeed.CreateLegacyAccountAsync(factory, Password);

        var response = await RegisterAsync(client, existing, EmailFor(NewLogin()));

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(LoginTaken, Fields(error).GetProperty("login").GetString());
    }

    // --- Limit prób ---------------------------------------------------------

    [Fact]
    public async Task Fifth_wrong_code_ends_the_registration_and_releases_the_login()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();
        var email = EmailFor(login);

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);

        var code = factory.ReadLastVerificationCode(login);
        var wrong = code == "00000000" ? "11111111" : "00000000";

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var response = await ConfirmAsync(client, login, wrong);

            var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
            Assert.Equal(WrongCode, Fields(error).GetProperty("code").GetString());
        }

        var fifth = await ConfirmAsync(client, login, wrong);

        var exhausted = await IntegrationSeed.AssertRefusedAsync(fifth, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(RegistrationGone, Fields(exhausted).GetProperty("form").GetString());

        // Poprawny kod po wyczerpaniu prób niczego już nie zakłada.
        var late = await ConfirmAsync(client, login, code);

        var gone = await IntegrationSeed.AssertRefusedAsync(late, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(RegistrationGone, Fields(gone).GetProperty("form").GetString());
        await IntegrationSeed.AssertRefusedAsync(
            await LoginAsync(client, login, Password), HttpStatusCode.Unauthorized, ApiErrorCodes.Unauthorized);

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);
    }

    [Fact]
    public async Task Confirming_a_login_without_a_registration_is_refused_on_the_form()
    {
        using var client = factory.CreateClient();

        var response = await ConfirmAsync(client, NewLogin(), "12345678");

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(RegistrationGone, Fields(error).GetProperty("form").GetString());
    }

    // --- Wygaśnięcie --------------------------------------------------------

    [Fact]
    public async Task Correct_code_after_expiry_is_refused_on_the_form_and_creates_no_account()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, EmailFor(login))).StatusCode);
        var code = factory.ReadLastVerificationCode(login);

        await ExpireAsync(factory, login);

        var response = await ConfirmAsync(client, login, code);

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.Equal(RegistrationGone, Fields(error).GetProperty("form").GetString());
        await IntegrationSeed.AssertRefusedAsync(
            await LoginAsync(client, login, Password), HttpStatusCode.Unauthorized, ApiErrorCodes.Unauthorized);
    }

    [Fact]
    public async Task Expired_registration_no_longer_reserves_the_login_or_the_email()
    {
        using var client = factory.CreateClient();
        var login = NewLogin();
        var email = EmailFor(login);

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);

        await ExpireAsync(factory, login);

        // Sprzątanie leniwe w kroku 1: wygasły wiersz znika, zanim krok 1
        // sprawdzi zajętość, więc ten sam login i adres przechodzą od razu.
        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, email)).StatusCode);

        var pending = await ReadPendingAsync(factory, login);
        Assert.NotNull(pending);
        Assert.True(pending.ExpiresAt > DateTimeOffset.UtcNow, "Został wygasły wiersz zamiast nowego.");
    }

    // --- Limit tempa --------------------------------------------------------

    [Fact]
    public async Task Request_over_the_registration_rate_limit_is_refused_with_rate_limited()
    {
        using var client = rateLimitedFactory.CreateClient();

        for (var request = 1; request <= RateLimitedApiFactory.PermitLimit; request++)
        {
            var login = NewLogin();
            Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, login, EmailFor(login))).StatusCode);
        }

        var refusedLogin = NewLogin();
        var response = await RegisterAsync(client, refusedLogin, EmailFor(refusedLogin));

        var error = await IntegrationSeed.AssertRefusedAsync(
            response, HttpStatusCode.TooManyRequests, ApiErrorCodes.RateLimited);
        Assert.Empty(error.Context.EnumerateObject());
        Assert.Null(await ReadPendingAsync(rateLimitedFactory, refusedLogin));
    }

    // --- Porażka wysyłki ----------------------------------------------------

    [Fact]
    public async Task Failed_mail_delivery_answers_mail_unavailable_and_leaves_no_reservation_or_code_in_the_log()
    {
        using var client = failingMailFactory.CreateClient();
        var login = NewLogin();

        var response = await RegisterAsync(client, login, EmailFor(login));

        var body = await response.Content.ReadAsStringAsync();
        var error = await IntegrationSeed.AssertRefusedAsync(
            response, HttpStatusCode.ServiceUnavailable, ApiErrorCodes.MailUnavailable);
        Assert.Empty(error.Context.EnumerateObject());

        Assert.Null(await ReadPendingAsync(failingMailFactory, login));

        var code = failingMailFactory.Sender.LastCode;
        Assert.NotNull(code);
        Assert.DoesNotContain(code, body);

        // Wpis jest — dopiero wtedy jego brak kodu cokolwiek znaczy.
        var log = ReadLog(failingMailFactory);
        Assert.Contains(FailingMailSender.Marker, log);
        Assert.DoesNotContain(code, log);
    }

    // --- Stare konto --------------------------------------------------------

    [Fact]
    public async Task Account_from_before_logins_signs_in_with_its_email_as_the_login()
    {
        using var client = factory.CreateClient();
        var email = await IntegrationSeed.CreateLegacyAccountAsync(factory, Password);

        var response = await LoginAsync(client, email, Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var account = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(email, account.GetProperty("login").GetString());
        Assert.Equal(email, account.GetProperty("email").GetString());
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>Losowy login w dozwolonym zestawie znaków, 13 znaków.</summary>
    private static string NewLogin() => $"t{Guid.NewGuid():N}"[..13];

    private static string EmailFor(string login) => $"{login}@test.local";

    private static Task<HttpResponseMessage> RegisterAsync(
        HttpClient client,
        string login,
        string email,
        string password = Password)
        => client.PostAsJsonAsync("/auth/register", new { login, email, password });

    private static Task<HttpResponseMessage> ConfirmAsync(HttpClient client, string login, string code)
        => client.PostAsJsonAsync("/auth/register/confirm", new { login, code });

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string login, string password)
        => client.PostAsJsonAsync("/auth/login", new { login, password });

    private static JsonElement Fields(ErrorEnvelope error) => error.Context.GetProperty("fields");

    /// <summary>Oczekująca rejestracja loginu albo <c>null</c>, odczytana wprost z tabeli.</summary>
    private static async Task<PendingRegistration?> ReadPendingAsync(TestApiFactory host, string login)
    {
        await using (host.CreateDbScope(out var db))
        {
            var normalized = login.ToUpperInvariant();

            return await db.PendingRegistrations
                .AsNoTracking()
                .SingleOrDefaultAsync(row => row.NormalizedUserName == normalized);
        }
    }

    /// <summary>Przesuwa termin rejestracji loginu w przeszłość — wprost w tabeli.</summary>
    private static async Task ExpireAsync(TestApiFactory host, string login)
    {
        await using (host.CreateDbScope(out var db))
        {
            var normalized = login.ToUpperInvariant();
            var row = await db.PendingRegistrations.SingleAsync(r => r.NormalizedUserName == normalized);

            row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);

            await db.SaveChangesAsync();
        }
    }

    /// <summary>Odkodowana treść najnowszej wiadomości dla loginu.</summary>
    private static string ReadMailText(TestApiFactory host, string login)
    {
        foreach (var file in Directory.GetFiles(host.MailDirectory, "*.eml").OrderDescending(StringComparer.Ordinal))
        {
            using var message = MimeKit.MimeMessage.Load(file);

            if (message.TextBody?.Contains(VerificationMessage.LoginLinePrefix + login) == true)
            {
                Assert.Equal($"TreeGrid — kod weryfikacyjny dla {login}", message.Subject);

                return message.TextBody;
            }
        }

        Assert.Fail($"Brak wiadomości dla loginu '{login}'.");

        return string.Empty;
    }

    /// <summary>
    /// Treść plików <c>api-*.log</c> katalogu fabryki — z
    /// <see cref="FileShare.ReadWrite"/>, bo logger trzyma plik otwarty.
    /// </summary>
    private static string ReadLog(TestApiFactory host)
    {
        Assert.True(Directory.Exists(host.LogDirectory), $"Katalog logu '{host.LogDirectory}' nie powstał.");

        var content = new StringBuilder();

        foreach (var file in Directory.GetFiles(host.LogDirectory, "api-*.log").Order())
        {
            using var stream = new FileStream(
                file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            content.Append(reader.ReadToEnd());
        }

        return content.ToString();
    }

    /// <summary>Host z limitem tempa kroku 1 obniżonym do <see cref="PermitLimit"/>.</summary>
    public sealed class RateLimitedApiFactory : TestApiFactory
    {
        public const int PermitLimit = 2;

        protected override int RegistrationPermitLimit => PermitLimit;
    }

    /// <summary>Host, którego nadawca poczty zawsze rzuca wyjątek.</summary>
    public sealed class FailingMailApiFactory : TestApiFactory
    {
        internal FailingMailSender Sender { get; } = new();

        private protected override IVerificationMailSender CreateMailSender(MailSettings settings) => Sender;
    }

    /// <summary>
    /// Nadawca, który zapamiętuje otrzymany kod i rzuca wyjątek — jak serwer
    /// SMTP odrzucający uwierzytelnienie. Treść wyjątku nie zawiera kodu, więc
    /// kod w logu mógłby się wziąć wyłącznie z kodu pod testem.
    /// </summary>
    internal sealed class FailingMailSender : IVerificationMailSender
    {
        /// <summary>Treść wyjątku — wyłącznie ASCII, żeby dało się ją znaleźć w pliku logu.</summary>
        public const string Marker = "injected-mail-failure";

        private string? _lastCode;

        public string? LastCode => Volatile.Read(ref _lastCode);

        public Task SendVerificationCodeAsync(
            string login,
            string email,
            string code,
            DateTimeOffset expiresAt,
            CancellationToken cancellationToken)
        {
            Volatile.Write(ref _lastCode, code);

            throw new InvalidOperationException(Marker);
        }
    }
}
