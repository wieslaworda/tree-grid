using System.Text.Json;
using Api.Auth;
using Api.Errors;

namespace Api.Tests;

/// <summary>
/// Regresja kształtu odpowiedzi błędnych uwierzytelniania i tych reguł, które
/// psują się najciszej: identyczności odpowiedzi dla nieistniejącego konta
/// i złego hasła oraz odwzorowania pól formularza w <c>context</c>.
///
/// Tak jak <see cref="ApiErrorContractTests"/>, testy celowo nie podnoszą hosta
/// (<c>WebApplicationFactory</c>) — sprawdzany jest JSON, który zobaczy klient,
/// i decyzja, która go wybiera, a nie potok HTTP. Dlatego wynik weryfikacji
/// poświadczeń jest w kodzie oddzielony od odpowiedzi
/// (<see cref="AuthResponses.DescribeLoginFailure"/>): bez tego rozdzielenia
/// reguła „obie porażki wyglądają tak samo" dałaby się sprawdzić wyłącznie
/// ręcznie.
/// </summary>
public class AuthErrorContractTests
{
    /// <summary>
    /// Pola <c>ProblemDetails</c> (RFC 9457) — domyślny kształt błędu w ASP.NET
    /// Core i dokładnie ten dryf, przed którym broni zapis w CLAUDE.md.
    /// </summary>
    private static readonly string[] ProblemDetailsFields = ["type", "title", "status", "detail"];

    [Fact]
    public void Nonexistent_account_and_wrong_password_are_indistinguishable()
    {
        var notFound = AuthResponses.DescribeLoginFailure(LoginOutcome.UserNotFound, lockoutEnd: null);
        var wrongPassword = AuthResponses.DescribeLoginFailure(LoginOutcome.WrongPassword, lockoutEnd: null);

        // Ten sam status, ten sam kod, ten sam komunikat, ten sam `context` —
        // każda różnica pozwoliłaby sprawdzić, czy konto o danym adresie
        // istnieje, bez znajomości hasła.
        Assert.Equal(notFound.StatusCode, wrongPassword.StatusCode);
        Assert.Equal(401, notFound.StatusCode);
        Assert.Equal(
            JsonSerializer.Serialize(notFound.Error),
            JsonSerializer.Serialize(wrongPassword.Error));
    }

    [Fact]
    public void Unauthorized_error_has_the_contract_shape_and_an_empty_context()
    {
        var failure = AuthResponses.DescribeLoginFailure(LoginOutcome.WrongPassword, lockoutEnd: null);

        using var document = Serialize(failure.Error);

        var error = document.RootElement.GetProperty("error");

        Assert.Equal(["error"], PropertyNames(document.RootElement));
        Assert.Equal(["code", "message", "context"], PropertyNames(error));
        Assert.Equal(ApiErrorCodes.Unauthorized, error.GetProperty("code").GetString());

        // Pusty `context` nie jest przypadkiem: cokolwiek by tam trafiło —
        // adres, licznik prób, powód — odróżniłoby oba przypadki porażki.
        Assert.Empty(error.GetProperty("context").EnumerateObject());
    }

    [Fact]
    public void Locked_account_error_carries_its_own_code_and_the_lockout_end()
    {
        var lockoutEnd = new DateTimeOffset(2026, 9, 22, 18, 30, 0, TimeSpan.FromHours(2));

        var failure = AuthResponses.DescribeLoginFailure(LoginOutcome.LockedOut, lockoutEnd);

        using var document = Serialize(failure.Error);

        var error = document.RootElement.GetProperty("error");

        // Odrębny kod, bo użytkownik musi wiedzieć, że czekanie ma sens.
        Assert.Equal(ApiErrorCodes.AccountLocked, error.GetProperty("code").GetString());
        Assert.NotEqual(ApiErrorCodes.HttpError, error.GetProperty("code").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(
            lockoutEnd.ToString("O"),
            context.GetProperty(AuthResponses.LockoutEndContextKey).GetString());
    }

    [Fact]
    public void Validation_error_carries_field_violations_under_one_fixed_key()
    {
        var error = ApiError.Validation(
            "Przesłane dane są nieprawidłowe.",
            new Dictionary<string, string>
            {
                [AuthFormFields.Email] = "Podaj adres e-mail.",
                [AuthFormFields.RegistrationCode] = "Nieprawidłowy kod rejestracyjny.",
            });

        using var document = Serialize(error);

        var detail = document.RootElement.GetProperty("error");

        Assert.Equal(ApiErrorCodes.ValidationError, detail.GetProperty("code").GetString());

        // Naruszenia jadą pod jednym, stałym kluczem — obie strony granicy
        // czytają je tak samo, a `context` nie zamienia się w worek pól.
        var context = detail.GetProperty("context");

        Assert.Equal([ApiErrorContextKeys.Fields], PropertyNames(context));

        var fields = context.GetProperty(ApiErrorContextKeys.Fields);

        Assert.Equal("Podaj adres e-mail.", fields.GetProperty("email").GetString());
        Assert.Equal(
            "Nieprawidłowy kod rejestracyjny.",
            fields.GetProperty("registrationCode").GetString());
    }

    [Fact]
    public void Field_names_match_the_react_router_form_field_names()
    {
        // Zgodność nazw pól jest utrzymywana ręcznie po obu stronach granicy
        // i nic jej nie sprawdza przy budowaniu. Ten test jest jedynym
        // miejscem, w którym jej złamanie w ogóle się odezwie — zmiana nazwy
        // tutaj wymaga zmiany atrybutu `name` w formularzu.
        Assert.Equal("email", AuthFormFields.Email);
        Assert.Equal("password", AuthFormFields.Password);
        Assert.Equal("registrationCode", AuthFormFields.RegistrationCode);
        Assert.Equal("form", AuthFormFields.Form);
    }

    [Fact]
    public void New_error_codes_carry_no_problem_details_fields()
    {
        // Wyniki wyliczane są w pętli, a nie jako `[Theory]` z `[InlineData]`:
        // `LoginOutcome` jest typem wewnętrznym API, więc nie może stać
        // w sygnaturze publicznej metody testowej.
        LoginOutcome[] outcomes =
            [LoginOutcome.UserNotFound, LoginOutcome.WrongPassword, LoginOutcome.LockedOut];

        foreach (var outcome in outcomes)
        {
            var failure = AuthResponses.DescribeLoginFailure(outcome, DateTimeOffset.UtcNow);

            using var document = Serialize(failure.Error);

            var root = document.RootElement;
            var error = root.GetProperty("error");

            foreach (var field in ProblemDetailsFields)
            {
                Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
                Assert.False(error.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
            }
        }
    }

    [Fact]
    public void Validation_error_carries_no_problem_details_fields()
    {
        var error = ApiError.Validation(
            "Przesłane dane są nieprawidłowe.",
            new Dictionary<string, string> { [AuthFormFields.Password] = "Podaj hasło." });

        using var document = Serialize(error);

        var root = document.RootElement;
        var detail = root.GetProperty("error");

        foreach (var field in ProblemDetailsFields)
        {
            Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
            Assert.False(detail.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
        }
    }

    private static JsonDocument Serialize(ApiError error)
        => JsonDocument.Parse(JsonSerializer.Serialize(error));

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];
}
