using System.Globalization;

namespace Api.Mail;

/// <summary>
/// Konfiguracja wysyłki kodu weryfikacyjnego — sekcja <c>Mail</c>. Jeden
/// transport na proces, wybierany kluczem <see cref="TransportKey"/>:
///
/// <list type="bullet">
/// <item><see cref="SmtpTransport"/> — poczta przez serwer SMTP (Gmail
/// <c>smtp.gmail.com:587</c>, STARTTLS, hasło aplikacji). Jedyny transport
/// dopuszczony poza Development.</item>
/// <item><see cref="DirectoryTransport"/> — plik <c>.eml</c> na wiadomość
/// w katalogu z <see cref="DirectoryPathKey"/>. Pętla deweloperska, testy
/// integracyjne i E2E: kod czyta się z pliku, bez skrzynki i bez hasła.</item>
/// </list>
///
/// Hasło SMTP jest sekretem i obowiązuje je to samo co sekrety w
/// <c>Api.Auth.AuthSecrets</c>: w Development <c>user-secrets</c>, poza nim
/// zmienna środowiskowa <c>Mail__Smtp__Password</c>, a w
/// <c>appsettings.json</c> wyłącznie pusta struktura
/// (<c>context/foundation/lessons.md</c>, „Sekrety…"). Żadna wartość z tej
/// sekcji nie trafia do komunikatu o brakach ani do logu.
/// </summary>
internal sealed class MailSettings
{
    public const string TransportKey = "Mail:Transport";

    public const string AdminAddressKey = "Mail:AdminAddress";

    public const string FromKey = "Mail:From";

    public const string SmtpHostKey = "Mail:Smtp:Host";

    public const string SmtpPortKey = "Mail:Smtp:Port";

    public const string SmtpUserNameKey = "Mail:Smtp:UserName";

    public const string SmtpPasswordKey = "Mail:Smtp:Password";

    public const string DirectoryPathKey = "Mail:Directory:Path";

    public const string SmtpTransport = "Smtp";

    public const string DirectoryTransport = "Directory";

    private MailSettings(
        string? transport,
        string? adminAddress,
        string? from,
        string? smtpHost,
        int? smtpPort,
        string? smtpUserName,
        string? smtpPassword,
        string? directoryPath)
    {
        Transport = transport;
        AdminAddress = adminAddress;
        From = from;
        SmtpHost = smtpHost;
        SmtpPort = smtpPort;
        SmtpUserName = smtpUserName;
        SmtpPassword = smtpPassword;
        DirectoryPath = directoryPath;
    }

    /// <summary>Transport w postaci z konfiguracji (może być pusty albo spoza listy).</summary>
    public string? Transport { get; }

    /// <summary>Adres administratora — jedyny odbiorca kodu.</summary>
    public string? AdminAddress { get; }

    /// <summary>Nadawca wiadomości. Dla Gmail — adres konta z <see cref="SmtpUserName"/>.</summary>
    public string? From { get; }

    public string? SmtpHost { get; }

    /// <summary>Port SMTP albo <c>null</c>, gdy brak go albo nie jest poprawnym numerem portu.</summary>
    public int? SmtpPort { get; }

    public string? SmtpUserName { get; }

    /// <summary>Hasło SMTP (dla Gmail — hasło aplikacji). Sekret.</summary>
    internal string? SmtpPassword { get; }

    /// <summary>
    /// Bezwzględny katalog plików <c>.eml</c> albo <c>null</c>, gdy klucz jest
    /// pusty. Ścieżka względna jest rozwiązywana względem katalogu treści, jak
    /// <c>FileLogging:Directory</c> — domyślne <c>MailOutbox</c> ląduje w
    /// <c>src/Api/MailOutbox/</c> niezależnie od katalogu roboczego procesu.
    /// </summary>
    public string? DirectoryPath { get; }

    /// <summary>Czy wybrany jest transport plikowy (wielkość liter bez znaczenia).</summary>
    public bool UsesDirectory
        => string.Equals(Transport, DirectoryTransport, StringComparison.OrdinalIgnoreCase);

    public static MailSettings FromConfiguration(IConfiguration configuration, string contentRootPath)
    {
        var directoryPath = configuration[DirectoryPathKey];

        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            directoryPath = null;
        }
        else if (!Path.IsPathRooted(directoryPath))
        {
            directoryPath = Path.GetFullPath(Path.Combine(contentRootPath, directoryPath));
        }

        return new MailSettings(
            configuration[TransportKey]?.Trim(),
            configuration[AdminAddressKey],
            configuration[FromKey],
            configuration[SmtpHostKey],
            ParsePort(configuration[SmtpPortKey]),
            configuration[SmtpUserNameKey],
            configuration[SmtpPasswordKey],
            directoryPath);
    }

    /// <summary>
    /// Wykaz braków w konfiguracji poczty — pusty, gdy wysyłka ma czym ruszyć.
    /// Poza Development transport musi być <see cref="SmtpTransport"/> z kompletem
    /// kluczy: transport plikowy na serwerze oznaczałby, że kody lądują na dysku,
    /// a administrator nie dostaje nic. W Development wystarczy kompletny
    /// wybrany transport.
    /// </summary>
    /// <remarks>
    /// Komunikaty nazywają klucz w obu zapisach — z dwukropkiem i jako zmienną
    /// środowiskową z podwójnym podkreśleniem — bo to jedyna informacja, która
    /// pozwala naprawić start. Wartość nie pojawia się nigdy, także wartość
    /// transportu spoza listy.
    /// </remarks>
    public IReadOnlyList<string> FindProblems(bool isDevelopment)
    {
        var problems = new List<string>();

        var isSmtp = string.Equals(Transport, SmtpTransport, StringComparison.OrdinalIgnoreCase);

        if (!isDevelopment && !isSmtp)
        {
            problems.Add(
                $"Poza Development wartość konfiguracji '{TransportKey}' " +
                $"({EnvironmentName(TransportKey)}) musi być '{SmtpTransport}'.");

            return problems;
        }

        if (!isSmtp && !UsesDirectory)
        {
            problems.Add(
                $"Wartość konfiguracji '{TransportKey}' ({EnvironmentName(TransportKey)}) " +
                $"musi być '{SmtpTransport}' albo '{DirectoryTransport}'.");

            return problems;
        }

        AddIfMissing(problems, AdminAddressKey, AdminAddress);
        AddIfMissing(problems, FromKey, From);

        if (isSmtp)
        {
            AddIfMissing(problems, SmtpHostKey, SmtpHost);

            if (SmtpPort is null)
            {
                problems.Add(
                    $"Brak poprawnego numeru portu w konfiguracji '{SmtpPortKey}' ({EnvironmentName(SmtpPortKey)}).");
            }

            AddIfMissing(problems, SmtpUserNameKey, SmtpUserName);
            AddIfMissing(problems, SmtpPasswordKey, SmtpPassword);
        }
        else
        {
            AddIfMissing(problems, DirectoryPathKey, DirectoryPath);
        }

        return problems;
    }

    /// <summary>
    /// Zatrzymuje wysyłkę przy niekompletnej konfiguracji wybranego transportu.
    /// Poza Development start i tak by nie wstał; w Development to jedyna
    /// bariera przed wysyłką z pustym hostem albo zapisem do katalogu
    /// roboczego procesu. Wyjątek kończy krok 1 odpowiedzią
    /// <c>mail_unavailable</c>, a jego treść — same nazwy kluczy — trafia do logu.
    /// </summary>
    public void ThrowIfIncomplete()
    {
        var problems = FindProblems(isDevelopment: true);

        if (problems.Count > 0)
        {
            throw new InvalidOperationException(
                "Konfiguracja poczty jest niekompletna: " + string.Join(" ", problems));
        }
    }

    /// <summary>Nazwa klucza jako zmiennej środowiskowej: <c>Mail:Smtp:Password</c> → <c>Mail__Smtp__Password</c>.</summary>
    internal static string EnvironmentName(string key) => key.Replace(":", "__", StringComparison.Ordinal);

    private static void AddIfMissing(List<string> problems, string key, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            problems.Add($"Brak wartości konfiguracji '{key}' ({EnvironmentName(key)}).");
        }
    }

    private static int? ParsePort(string? value)
        => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var port)
            && port is > 0 and <= 65535
                ? port
                : null;
}
