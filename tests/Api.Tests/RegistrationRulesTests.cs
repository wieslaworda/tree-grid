using Api.Auth;

namespace Api.Tests;

/// <summary>
/// Regresja reguł rejestracji z kodem weryfikacyjnym (S-14) — kształtu kodu,
/// reguły loginu i e-maila oraz oceny próby potwierdzenia.
///
/// Wzorem <see cref="TreeNameRulesTests"/> testy nie podnoszą hosta ani bazy:
/// reguły są czystymi funkcjami (<see cref="RegistrationRules"/>). Pełną ścieżkę
/// HTTP na SQLite sprawdza <see cref="AuthIntegrationTests"/>. Oczekiwane
/// wartości — 8 cyfr, 3–64 znaki, 5 prób, 30 minut — są wpisane z planów
/// <c>context/changes/zakladanie-konta/plan.md</c> i
/// <c>context/changes/kod-do-rejestrujacego/plan.md</c>, a nie czytane ze stałych.
/// </summary>
public class RegistrationRulesTests
{
    private static readonly DateTimeOffset ExpiresAt = new(2026, 10, 11, 12, 0, 0, TimeSpan.Zero);

    // --- Kod ----------------------------------------------------------------

    [Fact]
    public void Code_has_eight_digits_and_keeps_leading_zeros()
    {
        var codes = Enumerable.Range(0, 10_000).Select(_ => RegistrationRules.GenerateCode()).ToList();

        Assert.All(codes, code =>
        {
            Assert.Equal(8, code.Length);
            Assert.True(code.All(char.IsAsciiDigit), $"Kod '{code}' zawiera znak spoza cyfr.");
        });

        // Co dziesiąty kod zaczyna się od zera; brak takiego w 10 000 próbek
        // oznacza obcięte zera wiodące, a nie pecha (szansa rzędu 0,9^10000).
        Assert.Contains(codes, code => code[0] == '0');
    }

    // --- Login --------------------------------------------------------------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_or_blank_login_asks_for_a_login(string? login)
    {
        Assert.Equal("Podaj login.", RegistrationRules.ValidateLogin(login));
    }

    [Theory]
    [InlineData("ab")]
    [InlineData(" ab ")]
    public void Login_shorter_than_three_characters_after_trimming_is_rejected(string login)
    {
        Assert.Equal("Login musi mieć od 3 do 64 znaków.", RegistrationRules.ValidateLogin(login));
    }

    [Fact]
    public void Login_longer_than_sixty_four_characters_is_rejected()
    {
        Assert.Equal("Login musi mieć od 3 do 64 znaków.", RegistrationRules.ValidateLogin(new string('a', 65)));
    }

    [Fact]
    public void Logins_of_the_boundary_lengths_are_accepted()
    {
        Assert.Null(RegistrationRules.ValidateLogin("abc"));
        Assert.Null(RegistrationRules.ValidateLogin(new string('a', 64)));
    }

    [Theory]
    [InlineData("jan kowalski")]
    [InlineData("łukasz")]
    [InlineData("jan#1")]
    public void Login_with_a_character_outside_the_identity_set_is_rejected(string login)
    {
        Assert.Equal(
            "Login może zawierać wyłącznie litery bez polskich znaków, cyfry oraz znaki - . _ @ +",
            RegistrationRules.ValidateLogin(login));
    }

    [Fact]
    public void Email_address_is_accepted_as_a_login()
    {
        // Konta sprzed S-14 mają login równy adresowi i nim się logują.
        Assert.Null(RegistrationRules.ValidateLogin("jan.kowalski+dyspozycja@example.com"));
    }

    // --- Formularz kroku 1 --------------------------------------------------

    [Fact]
    public void Empty_registration_names_every_field()
    {
        var fields = RegistrationRules.ValidateRegistration(null, " ", "");

        Assert.Equal("Podaj login.", fields["login"]);
        Assert.Equal("Podaj adres e-mail.", fields["email"]);
        Assert.Equal("Podaj hasło.", fields["password"]);
    }

    [Fact]
    public void Email_without_a_valid_shape_is_rejected()
    {
        var fields = RegistrationRules.ValidateRegistration("jan", "jan.example.com", "haslo");

        Assert.Equal(["email"], fields.Keys);
        Assert.Equal("Podaj poprawny adres e-mail.", fields["email"]);
    }

    [Theory]
    [InlineData("a b@example.com")]
    [InlineData("a;b@example.com")]
    [InlineData("Jan <jan@example.com>")]
    [InlineData("jan@example.com, ewa@example.com")]
    public void Email_that_mail_delivery_would_not_take_as_a_single_bare_recipient_is_rejected(string email)
    {
        // Każdy z tych adresów przechodzi test kształtu `EmailAddressAttribute`;
        // odpada dopiero na parserze odbiorcy (S-15).
        var fields = RegistrationRules.ValidateRegistration("jan", email, "haslo");

        Assert.Equal(["email"], fields.Keys);
        Assert.Equal("Podaj poprawny adres e-mail.", fields["email"]);
    }

    [Fact]
    public void Complete_registration_has_no_violations()
    {
        Assert.Empty(RegistrationRules.ValidateRegistration(" jan ", " jan@example.com ", "haslo"));
    }

    // --- Ocena próby potwierdzenia -----------------------------------------

    [Fact]
    public void Registration_is_expired_exactly_at_its_expiry_moment()
    {
        Assert.Equal(
            ConfirmOutcome.Expired,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 0, codeMatches: false, now: ExpiresAt));
        Assert.Equal(
            ConfirmOutcome.WrongCode,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 0, codeMatches: false, now: ExpiresAt.AddTicks(-1)));
    }

    [Fact]
    public void Wrong_code_after_three_failures_leaves_attempts()
    {
        Assert.Equal(
            ConfirmOutcome.WrongCode,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 3, codeMatches: false, now: ExpiresAt.AddHours(-1)));
    }

    [Fact]
    public void Wrong_code_after_four_failures_exhausts_the_attempts()
    {
        Assert.Equal(
            ConfirmOutcome.AttemptsExhausted,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 4, codeMatches: false, now: ExpiresAt.AddHours(-1)));
    }

    [Fact]
    public void Correct_code_after_expiry_is_expired()
    {
        // Termin wygrywa z poprawnym kodem.
        Assert.Equal(
            ConfirmOutcome.Expired,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 0, codeMatches: true, now: ExpiresAt.AddSeconds(1)));
    }

    [Fact]
    public void Correct_code_in_time_confirms_even_after_four_failures()
    {
        Assert.Equal(
            ConfirmOutcome.Confirmed,
            RegistrationRules.Evaluate(ExpiresAt, failedAttempts: 4, codeMatches: true, now: ExpiresAt.AddHours(-1)));
    }

    [Fact]
    public void Limits_match_the_plan()
    {
        Assert.Equal(TimeSpan.FromMinutes(30), RegistrationRules.CodeLifetime);
        Assert.Equal(5, RegistrationRules.MaxCodeAttempts);
        Assert.Equal(3, RegistrationRules.LoginMinLength);
        Assert.Equal(64, RegistrationRules.LoginMaxLength);
    }
}
