namespace Api.Auth;

/// <summary>
/// Dwa sekrety aplikacji: kod rejestracyjny i klucz podpisu ciasteczka sesji.
///
/// Obie wartości czytane są ze standardowej konfiguracji .NET i **nigdy** nie
/// leżą w repozytorium (`infrastructure.md:208`). `appsettings.json` niesie
/// wyłącznie strukturę — puste wartości, żeby widać było, co trzeba ustawić.
/// Kolejność dostawców konfiguracji w <c>WebApplication.CreateBuilder</c>
/// sprawia, że oba poniższe źródła przebijają plik:
///
/// <list type="bullet">
/// <item>Development — `user-secrets` (magazyn poza katalogiem projektu):
/// <c>dotnet user-secrets set "Auth:RegistrationCode" "&lt;wartość&gt;" --project src/Api</c>,
/// <c>dotnet user-secrets set "Auth:SessionSigningKey" "&lt;wartość&gt;" --project src/Api</c>.
/// Działa dzięki <c>UserSecretsId</c> w <c>src/Api/Api.csproj</c>.</item>
/// <item>Poza Development — zmienne środowiskowe, w których dwukropek
/// zastępuje podwójne podkreślenie: <c>Auth__RegistrationCode</c>,
/// <c>Auth__SessionSigningKey</c>.</item>
/// </list>
///
/// Żadnego dodatkowego kodu ładującego to nie wymaga — oba dostawcy są
/// domyślne.
/// </summary>
internal sealed class AuthSecrets
{
    /// <summary>Klucz konfiguracji kodu rejestracyjnego.</summary>
    public const string RegistrationCodeKey = "Auth:RegistrationCode";

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

    private AuthSecrets(string? registrationCode, string? sessionSigningKey)
    {
        RegistrationCode = registrationCode;
        SessionSigningKey = sessionSigningKey;
    }

    /// <summary>Kod odróżniający zaproszonego dyspozytora od przypadkowego gościa.</summary>
    private string? RegistrationCode { get; }

    /// <summary>Klucz, którym serwer React Routera podpisuje ciasteczko sesji.</summary>
    private string? SessionSigningKey { get; }

    public static AuthSecrets FromConfiguration(IConfiguration configuration) => new(
        configuration[RegistrationCodeKey],
        configuration[SessionSigningKeyKey]);

    /// <summary>
    /// Wykaz braków w konfiguracji sekretów — pusty, gdy wszystko jest na
    /// miejscu. Komunikaty nazywają klucz, bo to jedyna informacja, która
    /// pozwala naprawić start; sama wartość nigdzie się nie pojawia, także
    /// w logu.
    /// </summary>
    public IReadOnlyList<string> FindProblems()
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(RegistrationCode))
        {
            problems.Add(MissingMessage(RegistrationCodeKey));
        }

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
    /// Kod rejestracyjny albo wyjątek. Zwrócenie pustej wartości byłoby tu
    /// najgorszym z możliwych zachowań: pusty kod zgadzałby się z pustym
    /// polem formularza, czyli brak konfiguracji otwierałby rejestrację dla
    /// każdego, kto trafił pod adres tunelu. Ścieżka bez sekretu ma się
    /// zatrzymać, nie przepuścić.
    /// </summary>
    public string RequireRegistrationCode()
        => string.IsNullOrWhiteSpace(RegistrationCode)
            ? throw new InvalidOperationException(MissingMessage(RegistrationCodeKey))
            : RegistrationCode;

    /// <summary>
    /// Klucz podpisu albo wyjątek — razem z wymuszeniem minimalnej długości.
    /// Poza Development obie reguły sprawdza już start aplikacji; tutaj są
    /// ponownie, bo w Development sekretów może jeszcze nie być, a endpoint
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
