namespace Api.Auth;

/// <summary>
/// Sekret uwierzytelniania: klucz podpisu ciasteczka sesji. Drugi sekret
/// aplikacji — hasło SMTP do wysyłki kodu weryfikacyjnego — należy do sekcji
/// <c>Mail</c> (<c>Api.Mail.MailSettings</c>) i podlega tym samym regułom.
///
/// Wartość czytana jest ze standardowej konfiguracji .NET i **nigdy** nie
/// leży w repozytorium (<c>infrastructure.md:208</c>). <c>appsettings.json</c> niesie
/// wyłącznie strukturę — pustą wartość, żeby widać było, co trzeba ustawić.
/// Kolejność dostawców konfiguracji w <c>WebApplication.CreateBuilder</c>
/// sprawia, że oba poniższe źródła przebijają plik:
///
/// <list type="bullet">
/// <item>Development — `user-secrets` (magazyn poza katalogiem projektu):
/// <c>dotnet user-secrets set "Auth:SessionSigningKey" "&lt;wartość&gt;" --project src/Api</c>.
/// Działa dzięki <c>UserSecretsId</c> w <c>src/Api/Api.csproj</c>.</item>
/// <item>Poza Development — zmienna środowiskowa, w której dwukropek
/// zastępuje podwójne podkreślenie: <c>Auth__SessionSigningKey</c>.</item>
/// </list>
///
/// Żadnego dodatkowego kodu ładującego to nie wymaga — oba dostawcy są
/// domyślne.
/// </summary>
internal sealed class AuthSecrets
{
    /// <summary>Klucz konfiguracji klucza podpisu ciasteczka sesji.</summary>
    public const string SessionSigningKeyKey = "Auth:SessionSigningKey";

    /// <summary>
    /// Minimalna długość klucza podpisu. Podpis ciasteczka jest jedyną rzeczą,
    /// która odróżnia sesję wydaną przez serwer od sesji dopisanej ręcznie,
    /// a klucz krótki na tyle, żeby dało się go zgadnąć, znosi całą bramę.
    /// 32 znaki to długość, przy której losowo wygenerowana wartość niesie
    /// rząd 256 bitów — próg, nie zalecenie: dłuższy jest lepszy.
    /// </summary>
    public const int MinimumSessionSigningKeyLength = 32;

    private AuthSecrets(string? sessionSigningKey)
    {
        SessionSigningKey = sessionSigningKey;
    }

    /// <summary>Klucz, którym serwer React Routera podpisuje ciasteczko sesji.</summary>
    private string? SessionSigningKey { get; }

    public static AuthSecrets FromConfiguration(IConfiguration configuration) => new(
        configuration[SessionSigningKeyKey]);

    /// <summary>
    /// Wykaz braków w konfiguracji sekretu — pusty, gdy wszystko jest na
    /// miejscu. Komunikaty nazywają klucz, bo to jedyna informacja, która
    /// pozwala naprawić start; sama wartość nigdzie się nie pojawia, także
    /// w logu.
    /// </summary>
    public IReadOnlyList<string> FindProblems()
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(SessionSigningKey))
        {
            problems.Add(MissingMessage(SessionSigningKeyKey));
        }
        else if (SessionSigningKey.Length < MinimumSessionSigningKeyLength)
        {
            problems.Add(TooShortMessage());
        }

        return problems;
    }

    /// <summary>
    /// Klucz podpisu albo wyjątek — razem z wymuszeniem minimalnej długości.
    /// Poza Development obie reguły sprawdza już start aplikacji; tutaj są
    /// ponownie, bo w Development sekretu może jeszcze nie być, a endpoint
    /// ma wtedy odmówić głośno, nie wydać pustego klucza.
    /// </summary>
    public string RequireSessionSigningKey()
    {
        if (string.IsNullOrWhiteSpace(SessionSigningKey))
        {
            throw new InvalidOperationException(MissingMessage(SessionSigningKeyKey));
        }

        return SessionSigningKey.Length < MinimumSessionSigningKeyLength
            ? throw new InvalidOperationException(TooShortMessage())
            : SessionSigningKey;
    }

    private static string MissingMessage(string key)
        => $"Brak wartości konfiguracji '{key}'.";

    private static string TooShortMessage()
        => $"Wartość konfiguracji '{SessionSigningKeyKey}' jest krótsza niż " +
           $"{MinimumSessionSigningKeyLength} znaków.";
}
