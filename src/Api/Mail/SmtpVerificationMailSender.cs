using MailKit.Net.Smtp;
using MailKit.Security;

namespace Api.Mail;

/// <summary>
/// Wysyłka przez serwer SMTP (MailKit) — transport produkcyjny. Dla Gmail:
/// <c>smtp.gmail.com:587</c>, STARTTLS i hasło aplikacji (wymaga weryfikacji
/// dwuetapowej na koncie nadawcy).
/// </summary>
/// <remarks>
/// Połączenie na wiadomość, bez puli: wiadomości jest kilka na dobę, a
/// trzymane połączenie Gmail i tak zrywa po bezczynności. Szyfrowanie jest
/// wymagane, nigdy „jeśli dostępne": port 465 łączy się od razu po TLS,
/// każdy inny wymaga STARTTLS. Tryb <c>Auto</c> z MailKit przy serwerze bez
/// STARTTLS wysłałby hasło jawnym tekstem.
/// </remarks>
internal sealed class SmtpVerificationMailSender(MailSettings settings) : IVerificationMailSender
{
    /// <summary>
    /// Limit pojedynczej operacji SMTP. Krok 1 czeka na wysyłkę w żądaniu,
    /// więc domyślne dwie minuty MailKit trzymałyby formularz w zawieszeniu
    /// długo po tym, jak użytkownik uzna, że coś się zepsuło.
    /// </summary>
    private const int TimeoutMilliseconds = 30_000;

    private const int ImplicitTlsPort = 465;

    public async Task SendVerificationCodeAsync(
        string login,
        string email,
        string code,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        settings.ThrowIfIncomplete();

        var message = VerificationMessage.Build(settings, login, email, code, expiresAt);
        var port = settings.SmtpPort!.Value;

        using var client = new SmtpClient { Timeout = TimeoutMilliseconds };

        await client.ConnectAsync(
            settings.SmtpHost!,
            port,
            port == ImplicitTlsPort ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls,
            cancellationToken);

        await client.AuthenticateAsync(settings.SmtpUserName!, settings.SmtpPassword!, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(quit: true, cancellationToken);
    }
}
