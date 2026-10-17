using System.Globalization;
using Api.Screens;
using MimeKit;

namespace Api.Mail;

/// <summary>
/// Jedna operacja: wyślij rejestrującemu, na adres podany w formularzu, kod
/// weryfikacyjny jego rejestracji (S-14, S-15). Transport wybiera
/// konfiguracja (<see cref="MailSettings"/>):
/// <see cref="SmtpVerificationMailSender"/> albo
/// <see cref="DirectoryVerificationMailSender"/>. Porażka wysyłki to wyjątek —
/// krok 1 rejestracji usuwa wtedy oczekującą rejestrację i odpowiada
/// <c>mail_unavailable</c>.
/// </summary>
internal interface IVerificationMailSender
{
    Task SendVerificationCodeAsync(
        string login,
        string email,
        string code,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken);
}

/// <summary>
/// Treść wiadomości z kodem — wspólna dla obu transportów, żeby plik
/// <c>.eml</c> z pętli deweloperskiej i testów był dokładnie tym, co dostaje
/// rejestrujący.
/// </summary>
internal static class VerificationMessage
{
    /// <summary>
    /// Początek wiersza z kodem; kod stoi zaraz po nim, a za nim koniec wiersza.
    /// </summary>
    /// <remarks>
    /// Od tego zdania zależą czytelnicy plików <c>.eml</c> poza tym plikiem:
    /// pomocnik odczytu kodu w <c>tests/Api.Tests/TestApiFactory.cs</c>
    /// (przez <see cref="CodePattern"/>) i setup E2E
    /// <c>tests/e2e/auth.setup.ts</c>, który wyciąga kod z surowego pliku
    /// wyrażeniem <c>Kod weryfikacyjny: (\d{8})</c>. Zmiana brzmienia bez
    /// zmiany tamtego wyrażenia nie wywali buildu — setup E2E po prostu nie
    /// znajdzie kodu.
    /// </remarks>
    internal const string CodeLinePrefix = "Kod weryfikacyjny: ";

    /// <summary>Wyrażenie wyciągające kod z treści — ten sam zapis co w setupie E2E.</summary>
    internal const string CodePattern = @"Kod weryfikacyjny: (\d{8})";

    /// <summary>
    /// Początek wiersza z loginem wnioskodawcy — po nim czytelnicy plików
    /// <c>.eml</c> rozpoznają, której rejestracji dotyczy kod.
    /// </summary>
    internal const string LoginLinePrefix = "Login: ";

    /// <summary>
    /// Buduje wiadomość. Treść jest zwykłym tekstem w kodowaniu
    /// quoted-printable, ustawionym jawnie: wiersze z samych znaków ASCII —
    /// a takie są wiersze z loginem i kodem — zostają w pliku dosłownie, więc
    /// da się je znaleźć wyrażeniem w surowym <c>.eml</c>. Przy kodowaniu
    /// wybieranym automatycznie MimeKit mógłby wybrać base64. Nadawcę sprawdza
    /// wcześniej <see cref="MailSettings.ThrowIfIncomplete"/>, a odbiorcę —
    /// adres z formularza, obcięty w endpoincie — walidacja kroku 1
    /// (<c>Api.Auth.RegistrationRules.ValidateRegistration</c>) tym samym
    /// parserem MimeKit, więc tutaj się już sparsuje.
    /// </summary>
    internal static MimeMessage Build(
        MailSettings settings,
        string login,
        string email,
        string code,
        DateTimeOffset expiresAt)
    {
        var expiresLocal = TimeZoneInfo.ConvertTime(expiresAt, ScreenValuesRules.ProductTimeZone);

        // Bez wiersza z adresem e-mail: adresat zna własny adres.
        var body =
            "Oto kod do potwierdzenia Twojej rejestracji w TreeGrid.\n" +
            "\n" +
            $"{LoginLinePrefix}{login}\n" +
            $"{CodeLinePrefix}{code}\n" +
            $"Ważny do: {expiresLocal.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)} (czas polski)\n" +
            "\n" +
            "Wpisz kod w formularzu potwierdzenia rejestracji razem ze swoim loginem.\n" +
            "\n" +
            "Jeśli nie zakładasz konta w TreeGrid, zignoruj tę wiadomość: rejestracja " +
            "wygaśnie sama.\n";

        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(settings.From!));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = $"TreeGrid — kod weryfikacyjny dla {login}";
        message.Body = new TextPart("plain")
        {
            Text = body,
            ContentTransferEncoding = ContentEncoding.QuotedPrintable,
        };

        return message;
    }
}
