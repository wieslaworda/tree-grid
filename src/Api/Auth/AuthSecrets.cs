namespace Api.Auth;

/// <summary>
/// Sekrety uwierzytelniania: klucz podpisu ciasteczka sesji i wspólny sekret
/// wywołań Node→API (<see cref="InternalCaller"/>). Trzeci sekret aplikacji —
/// hasło SMTP do wysyłki kodu weryfikacyjnego — należy do sekcji <c>Mail</c>
/// (<c>Api.Mail.MailSettings</c>) i podlega tym samym regułom.
///
/// Wartości czytane są ze standardowej konfiguracji .NET i **nigdy** nie
/// leżą w repozytorium (<c>infrastructure.md:208</c>). <c>appsettings.json</c> niesie
/// wyłącznie strukturę — puste wartości, żeby widać było, co trzeba ustawić.
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
/// Wspólny sekret Node→API jest wyjątkiem od podziału na user-secrets
/// i zmienne: ustawia się go zmienną <c>Auth__InternalApiSecret</c> także
/// w Development, bo tę samą wartość musi znać serwer React Routera
/// (<c>app/lib/api.server.ts</c> czyta zmienną o tej samej nazwie), a do
/// user-secrets .NET Node nie sięga. Jedna zmienna profilu użytkownika
/// wystarcza obu procesom lokalnym:
/// <c>[Environment]::SetEnvironmentVariable('Auth__InternalApiSecret', '&lt;wartość&gt;', 'User')</c>.
///
/// Żadnego dodatkowego kodu ładującego to nie wymaga — oba dostawcy są
/// domyślne.
/// </summary>
internal sealed class AuthSecrets
{
    /// <summary>Klucz konfiguracji klucza podpisu ciasteczka sesji.</summary>
    public const string SessionSigningKeyKey = "Auth:SessionSigningKey";

    /// <summary>
    /// Klucz konfiguracji wspólnego sekretu Node→API. Jako zmienna
    /// środowiskowa: <c>Auth__InternalApiSecret</c> — ta sama nazwa, którą
    /// czyta serwer React Routera.
    /// </summary>
    public const string InternalApiSecretKey = "Auth:InternalApiSecret";

    /// <summary>
    /// Minimalna długość klucza podpisu. Podpis ciasteczka jest jedyną rzeczą,
    /// która odróżnia sesję wydaną przez serwer od sesji dopisanej ręcznie,
    /// a klucz krótki na tyle, żeby dało się go zgadnąć, znosi całą bramę.
    /// 32 znaki to długość, przy której losowo wygenerowana wartość niesie
    /// rząd 256 bitów — próg, nie zalecenie: dłuższy jest lepszy.
    /// </summary>
    public const int MinimumSessionSigningKeyLength = 32;

    /// <summary>
    /// Minimalna długość wspólnego sekretu Node→API — z tego samego powodu
    /// i z tą samą wartością co <see cref="MinimumSessionSigningKeyLength"/>:
    /// sekret jest jedynym, co odróżnia serwer React Routera od każdego innego
    /// klienta, który dosięgnie API.
    /// </summary>
    public const int MinimumInternalApiSecretLength = 32;

    private AuthSecrets(string? sessionSigningKey, string? internalApiSecret)
    {
        SessionSigningKey = sessionSigningKey;
        InternalApiSecret = internalApiSecret;
    }

    /// <summary>Klucz, którym serwer React Routera podpisuje ciasteczko sesji.</summary>
    private string? SessionSigningKey { get; }

    /// <summary>Sekret, który serwer React Routera wysyła nagłówkiem <see cref="InternalCaller.Header"/>.</summary>
    private string? InternalApiSecret { get; }

    public static AuthSecrets FromConfiguration(IConfiguration configuration) => new(
        configuration[SessionSigningKeyKey],
        configuration[InternalApiSecretKey]);

    /// <summary>
    /// Wykaz braków w konfiguracji sekretów — pusty, gdy wszystko jest na
    /// miejscu. Komunikaty nazywają klucz, bo to jedyna informacja, która
    /// pozwala naprawić start; sama wartość nigdzie się nie pojawia, także
    /// w logu.
    /// </summary>
    public IReadOnlyList<string> FindProblems()
    {
        var problems = new List<string>();

        AddProblem(problems, SessionSigningKeyKey, SessionSigningKey, MinimumSessionSigningKeyLength);
        problems.AddRange(FindInternalApiSecretProblems());

        return problems;
    }

    /// <summary>
    /// Braki samego wspólnego sekretu Node→API. Osobno, bo w Development start
    /// wstaje mimo nich, ale ma o nich ostrzec: bramka
    /// (<see cref="InternalCaller"/>) odrzuca wtedy każde żądanie poza
    /// <c>GET /health</c>.
    /// </summary>
    public IReadOnlyList<string> FindInternalApiSecretProblems()
    {
        var problems = new List<string>();

        AddProblem(problems, InternalApiSecretKey, InternalApiSecret, MinimumInternalApiSecretLength);

        return problems;
    }

    /// <summary>
    /// Wspólny sekret Node→API albo <c>null</c>, gdy go brak albo jest zbyt
    /// krótki. <c>null</c> znaczy dla bramki „odrzuć wszystko" — nigdy „wpuść
    /// żądanie z pustym nagłówkiem".
    /// </summary>
    public string? FindInternalApiSecret()
        => FindInternalApiSecretProblems().Count == 0 ? InternalApiSecret : null;

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
            ? throw new InvalidOperationException(
                TooShortMessage(SessionSigningKeyKey, MinimumSessionSigningKeyLength))
            : SessionSigningKey;
    }

    private static void AddProblem(List<string> problems, string key, string? value, int minimumLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            problems.Add(MissingMessage(key));
        }
        else if (value.Length < minimumLength)
        {
            problems.Add(TooShortMessage(key, minimumLength));
        }
    }

    private static string MissingMessage(string key)
        => $"Brak wartości konfiguracji '{key}'.";

    private static string TooShortMessage(string key, int minimumLength)
        => $"Wartość konfiguracji '{key}' jest krótsza niż {minimumLength} znaków.";
}
