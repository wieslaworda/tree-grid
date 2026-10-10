using System.Globalization;

namespace Api.Mail;

/// <summary>
/// „Wysyłka" do katalogu: jeden plik <c>.eml</c> na wiadomość w
/// <see cref="MailSettings.DirectoryPath"/>. Transport pętli deweloperskiej
/// (<c>src/Api/MailOutbox/</c>, poza repozytorium), testów integracyjnych
/// i E2E — kod czyta się z pliku, bez skrzynki i bez hasła SMTP. Poza
/// Development start odmawia tego transportu (<see cref="MailSettings.FindProblems"/>).
/// </summary>
/// <remarks>
/// Nazwa pliku zaczyna się znacznikiem czasu UTC z dokładnością do ticku, więc
/// porządek nazw to porządek zapisu, a unikalny sufiks wyklucza nadpisanie
/// przy dwóch wiadomościach w tym samym ticku.
/// </remarks>
internal sealed class DirectoryVerificationMailSender(MailSettings settings) : IVerificationMailSender
{
    public async Task SendVerificationCodeAsync(
        string login,
        string email,
        string code,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        settings.ThrowIfIncomplete();

        var message = VerificationMessage.Build(settings, login, email, code, expiresAt);
        var directory = settings.DirectoryPath!;

        Directory.CreateDirectory(directory);

        var fileName =
            DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff", CultureInfo.InvariantCulture) +
            $"-{Guid.NewGuid():N}.eml";

        await message.WriteToAsync(Path.Combine(directory, fileName), cancellationToken);
    }
}
