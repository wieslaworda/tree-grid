using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;

namespace Api.Auth;

/// <summary>
/// Reguły rejestracji z kodem weryfikacyjnym (S-14) jako czyste funkcje: bez
/// bazy, bez hosta i bez <c>UserManager</c> — wzorem <c>TreeNameRules</c>.
/// Endpointy (<see cref="AuthEndpoints"/>) czytają i zapisują oczekujące
/// rejestracje oraz odwzorowują wynik na kopertę błędu, a kształt kodu,
/// walidacja pól i ocena próby potwierdzenia zapadają tutaj, dzięki czemu
/// sprawdza je test jednostkowy.
/// </summary>
internal static class RegistrationRules
{
    /// <summary>
    /// Czas ważności kodu i rezerwacji loginu oraz adresu. Doba daje
    /// administratorowi czas na przekazanie kodu, a nie trzyma loginu zajętego
    /// dłużej, niż ktokolwiek będzie na niego czekał.
    /// </summary>
    internal static readonly TimeSpan CodeLifetime = TimeSpan.FromHours(24);

    /// <summary>
    /// Najwięcej nieudanych prób potwierdzenia jednej rejestracji. Przy
    /// 8 cyfrach i 5 próbach szansa trafienia na ślepo to 5 na 100 milionów;
    /// po wyczerpaniu prób wiersz znika, a nowy kod wymaga ponownego kroku 1,
    /// czyli nowej wiadomości do administratora.
    /// </summary>
    internal const int MaxCodeAttempts = 5;

    /// <summary>Liczba cyfr kodu weryfikacyjnego.</summary>
    internal const int CodeLength = 8;

    internal const int LoginMinLength = 3;

    internal const int LoginMaxLength = 64;

    internal const string MissingLoginMessage = "Podaj login.";

    internal const string LoginLengthMessage = "Login musi mieć od 3 do 64 znaków.";

    internal const string LoginCharactersMessage =
        "Login może zawierać wyłącznie litery bez polskich znaków, cyfry oraz znaki - . _ @ +";

    internal const string MissingEmailMessage = "Podaj adres e-mail.";

    internal const string InvalidEmailMessage = "Podaj poprawny adres e-mail.";

    internal const string MissingPasswordMessage = "Podaj hasło.";

    /// <summary>
    /// Znaki dozwolone w loginie — domyślny zestaw Identity
    /// (<c>a-zA-Z0-9-._@+</c>), który przyjmuje także adres e-mail: istniejące
    /// konta mają login równy adresowi i logują się nim bez migracji danych.
    /// <c>Program.cs</c> zestawu nie zmienia, a <c>UserManager.CreateAsync</c>
    /// w kroku 2 sprawdza go ponownie walidatorem użytkownika Identity — tu
    /// stoi po to, żeby zły login odpadł w kroku 1, zanim pójdzie wiadomość.
    /// </summary>
    internal static readonly string AllowedLoginCharacters = new UserOptions().AllowedUserNameCharacters;

    private static readonly EmailAddressAttribute EmailShape = new();

    /// <summary>
    /// Kod weryfikacyjny: <see cref="CodeLength"/> cyfr z kryptograficznego
    /// generatora, z zerami wiodącymi — liczba z przedziału
    /// <c>[0, 10^8)</c> zapisana zawsze pełną długością, więc każdy z 100
    /// milionów kodów jest tak samo prawdopodobny.
    /// </summary>
    internal static string GenerateCode()
        => RandomNumberGenerator.GetInt32(100_000_000).ToString("D8", CultureInfo.InvariantCulture);

    /// <summary>
    /// Naruszenia pól kroku 1 jako mapa „pole → komunikat" — pusta, gdy pola
    /// mają poprawny kształt. Login i adres są oceniane po obcięciu spacji na
    /// brzegach, hasło dosłownie. Reguły złożoności hasła i zajętość loginu
    /// oraz adresu sprawdza endpoint, bo potrzebują <c>UserManager</c> i bazy.
    /// </summary>
    internal static Dictionary<string, string> ValidateRegistration(string? login, string? email, string? password)
    {
        var fields = new Dictionary<string, string>();

        var loginMessage = ValidateLogin(login);

        if (loginMessage is not null)
        {
            fields[AuthFormFields.Login] = loginMessage;
        }

        var trimmedEmail = email?.Trim() ?? string.Empty;

        if (trimmedEmail.Length == 0)
        {
            fields[AuthFormFields.Email] = MissingEmailMessage;
        }
        else if (!EmailShape.IsValid(trimmedEmail))
        {
            // Ten sam test kształtu, którym walidator użytkownika Identity
            // sprawdzi adres przy zakładaniu konta w kroku 2.
            fields[AuthFormFields.Email] = InvalidEmailMessage;
        }

        if (string.IsNullOrEmpty(password))
        {
            fields[AuthFormFields.Password] = MissingPasswordMessage;
        }

        return fields;
    }

    /// <summary>
    /// Komunikat pod pole loginu albo <c>null</c>, gdy login jest poprawny:
    /// wymagany, od <see cref="LoginMinLength"/> do <see cref="LoginMaxLength"/>
    /// znaków po obcięciu spacji, wyłącznie znaki z <see cref="AllowedLoginCharacters"/>.
    /// </summary>
    internal static string? ValidateLogin(string? login)
    {
        var trimmed = login?.Trim() ?? string.Empty;

        if (trimmed.Length == 0)
        {
            return MissingLoginMessage;
        }

        if (trimmed.Length is < LoginMinLength or > LoginMaxLength)
        {
            return LoginLengthMessage;
        }

        return trimmed.All(AllowedLoginCharacters.Contains) ? null : LoginCharactersMessage;
    }

    /// <summary>
    /// Czy rejestracja jest po terminie. Moment równy <paramref name="expiresAt"/>
    /// już jest — doba ważności to przedział prawostronnie otwarty.
    /// </summary>
    internal static bool IsExpired(DateTimeOffset expiresAt, DateTimeOffset now) => now >= expiresAt;

    /// <summary>
    /// Ocenia próbę potwierdzenia rejestracji. Kolejność rozstrzygnięć jest
    /// regułą: termin wygrywa z poprawnym kodem (kod po terminie nie zakłada
    /// konta), a zły kod, który wyczerpuje limit, różni się od zwykłego złego
    /// kodu, bo endpoint usuwa wtedy wiersz.
    /// </summary>
    /// <param name="expiresAt">Termin ważności rejestracji.</param>
    /// <param name="failedAttempts">Nieudane próby <b>przed</b> tą próbą.</param>
    /// <param name="codeMatches">Czy podany kod zgadza się z haszem.</param>
    /// <param name="now">Bieżący moment.</param>
    internal static ConfirmOutcome Evaluate(
        DateTimeOffset expiresAt,
        int failedAttempts,
        bool codeMatches,
        DateTimeOffset now)
    {
        if (IsExpired(expiresAt, now))
        {
            return ConfirmOutcome.Expired;
        }

        if (codeMatches)
        {
            return ConfirmOutcome.Confirmed;
        }

        return failedAttempts + 1 >= MaxCodeAttempts
            ? ConfirmOutcome.AttemptsExhausted
            : ConfirmOutcome.WrongCode;
    }
}

/// <summary>Wynik próby potwierdzenia rejestracji kodem.</summary>
internal enum ConfirmOutcome
{
    /// <summary>Rejestracja po terminie — niezależnie od kodu.</summary>
    Expired,

    /// <summary>Zły kod, próby jeszcze zostały.</summary>
    WrongCode,

    /// <summary>Zły kod, który właśnie wyczerpał limit prób.</summary>
    AttemptsExhausted,

    /// <summary>Poprawny kod w terminie — konto powstaje.</summary>
    Confirmed,
}
