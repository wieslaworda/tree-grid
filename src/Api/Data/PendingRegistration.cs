namespace Api.Data;

/// <summary>
/// Rejestracja czekająca na kod weryfikacyjny (S-14, FR-001 w wersji
/// z 2026-10-10). Krok 1 zakłada wiersz i wysyła kod administratorowi, krok 2
/// zamienia wiersz w konto (<see cref="AppUser"/>) albo go odrzuca. Konto nie
/// istnieje, dopóki nie padnie poprawny kod.
/// </summary>
/// <remarks>
/// Wiersz rezerwuje login na czas ważności: unikalny indeks na
/// <see cref="NormalizedUserName"/> jest drugą linią obrony za kontrolą
/// w kroku 1. Adres e-mail nie jest rezerwowany — może się powtarzać między
/// kontami i rejestracjami. Rezerwacja loginu pozwala krokowi 2 znaleźć
/// rejestrację po samym loginie — bez ukrytego identyfikatora i bez ciasteczka,
/// więc osoba może wrócić z kodem po kilku godzinach, z innego urządzenia.
///
/// Ani hasło, ani kod nie leżą tu jawnie: oba są haszami z
/// <c>IPasswordHasher</c>, a kod jawny istnieje wyłącznie w pamięci kroku 1
/// i w wysłanej wiadomości. Postaci znormalizowane liczy <c>UserManager</c>
/// (<c>NormalizeName</c>, <c>NormalizeEmail</c>) — ta sama funkcja, po której
/// Identity szuka kont, więc rezerwacja i konto porównują się tak samo.
///
/// Wygasłe wiersze nie mają usługi sprzątającej — usuwa je leniwie krok 1,
/// przed sprawdzeniem unikalności, a krok 2 przy próbie potwierdzenia.
/// </remarks>
public sealed class PendingRegistration
{
    /// <summary>
    /// Najdłuższy adres e-mail — ta sama długość, którą Identity nadaje kolumnie
    /// <c>AspNetUsers.Email</c>. Jak tam, to metadane kolumny: SQLite długości
    /// nie egzekwuje.
    /// </summary>
    public const int EmailMaxLength = 256;

    /// <summary>Identyfikator tekstowy (GUID), wzorem kluczy kont Identity.</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Login w postaci wpisanej, bez spacji na brzegach — trafi do konta.</summary>
    public string UserName { get; set; } = string.Empty;

    /// <summary>Login po <c>UserManager.NormalizeName</c>, z unikalnym indeksem.</summary>
    public string NormalizedUserName { get; set; } = string.Empty;

    /// <summary>Adres e-mail w postaci wpisanej, bez spacji na brzegach.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Adres po <c>UserManager.NormalizeEmail</c>; bez indeksu unikalnego — może się powtarzać.</summary>
    public string NormalizedEmail { get; set; } = string.Empty;

    /// <summary>Hasz hasła z kroku 1, przepisywany do konta bez ponownego haszowania.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Hasz kodu weryfikacyjnego. Kod jawny nie jest nigdzie zapisywany.</summary>
    public string CodeHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>
    /// Koniec ważności kodu i rezerwacji. Moment równy temu terminowi jest już
    /// po terminie (<c>Api.Auth.RegistrationRules.IsExpired</c>).
    /// </summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>
    /// Nieudane próby potwierdzenia. Próba, która osiąga
    /// <c>Api.Auth.RegistrationRules.MaxCodeAttempts</c>, usuwa wiersz.
    /// </summary>
    public int FailedAttempts { get; set; }
}
