using System.Text.Json.Serialization;

namespace Api.Errors;

/// <summary>
/// Koperta każdej odpowiedzi błędnej API. Kształt serializowanego obiektu to
/// dokładnie <c>{ "error": { "code", "message", "context" } }</c> — zapis
/// z CLAUDE.md, wiążący całe przyszłe API, nie tylko ten plaster.
/// </summary>
/// <remarks>
/// Nazwy pól są przypięte atrybutami, a nie zostawione polityce nazewnictwa
/// serializatora. Polityka jest ustawieniem hosta i da się ją zmienić
/// z zewnątrz tego typu; kontrakt, który wtedy po cichu zmienia kształt,
/// nie jest kontraktem. Dzięki przypięciu ten sam obiekt daje ten sam JSON
/// także tam, gdzie nie ma konfiguracji ASP.NET Core — na przykład w teście.
/// </remarks>
public sealed record ApiError(
    [property: JsonPropertyName("error")] ApiErrorDetail Error)
{
    /// <summary>
    /// Buduje kopertę. <paramref name="context"/> pominięty oznacza pusty
    /// obiekt, nigdy brak pola — patrz <see cref="ApiErrorDetail.Context"/>.
    /// </summary>
    public static ApiError Create(
        string code,
        string message,
        IReadOnlyDictionary<string, object?>? context = null)
        => new(new ApiErrorDetail(code, message, context ?? ApiErrorDetail.EmptyContext));

    /// <summary>
    /// Buduje kopertę błędu walidacji formularza: jeden kod
    /// <see cref="ApiErrorCodes.ValidationError"/>, a naruszenia poszczególnych
    /// pól w <c>context</c> pod jednym stałym kluczem
    /// (<see cref="ApiErrorContextKeys.Fields"/>), jako odwzorowanie nazwy pola
    /// na komunikat.
    /// </summary>
    /// <remarks>
    /// Jeden kod, a nie kod na każde naruszenie: klient rozgałęzia się po
    /// <c>code</c>, a „które pole i dlaczego" jest danymi, nie gatunkiem błędu.
    /// Metoda przechodzi przez <see cref="Create"/> — kształt koperty ma
    /// powstawać w jednym miejscu, także dla ścieżek, które dokładają
    /// własne dane.
    /// </remarks>
    public static ApiError Validation(
        string message,
        IReadOnlyDictionary<string, string> fields)
        => Create(
            ApiErrorCodes.ValidationError,
            message,
            new Dictionary<string, object?>
            {
                [ApiErrorContextKeys.Fields] = fields,
            });
}

/// <summary>
/// Treść błędu. <c>Code</c> jest stabilnym identyfikatorem maszynowym —
/// klient rozgałęzia się po nim, więc raz wprowadzonej wartości się nie zmienia.
/// <c>Message</c> jest tekstem dla użytkownika i z tego powodu jest polski
/// (<c>ConfigProvider</c> w <c>app/root.tsx</c> ustawia <c>pl_PL</c>).
/// <c>Context</c> niesie dane pomocnicze i jest zawsze obecny.
/// </summary>
public sealed record ApiErrorDetail(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("context")] IReadOnlyDictionary<string, object?> Context)
{
    /// <summary>
    /// Pusty kontekst. Istnieje, żeby brak danych pomocniczych dawał
    /// <c>"context": {}</c>, a nie pominięte pole — klient, który czyta
    /// <c>error.context</c>, nie musi wtedy rozróżniać dwóch przypadków.
    /// </summary>
    internal static readonly IReadOnlyDictionary<string, object?> EmptyContext =
        new Dictionary<string, object?>();
}

/// <summary>
/// Kody używane przez ścieżki błędne wpięte w potok. Nowe kody dopisują
/// ścieżki, które ich faktycznie potrzebują — lista nie powstaje na zapas.
/// </summary>
public static class ApiErrorCodes
{
    /// <summary>Nieobsłużony wyjątek po stronie serwera.</summary>
    public const string InternalError = "internal_error";

    /// <summary>Brak zasobu pod wskazanym adresem (404 z routingu).</summary>
    public const string NotFound = "not_found";

    /// <summary>Metoda HTTP nieobsługiwana przez zasób (405 z routingu).</summary>
    public const string MethodNotAllowed = "method_not_allowed";

    /// <summary>
    /// Żądanie nie zostało uwierzytelnione albo poświadczenia są nieprawidłowe
    /// (401). Kod jest wspólny dla nieistniejącego konta i złego hasła —
    /// rozróżnienie ich w odpowiedzi pozwoliłoby wyliczyć listę adresów e-mail.
    /// </summary>
    public const string Unauthorized = "unauthorized";

    /// <summary>
    /// Uwierzytelnione żądanie bez uprawnień do zasobu (403). Model dostępu
    /// jest dziś płaski i nic tego kodu nie zwraca, ale mapowanie statusów go
    /// zna, żeby 403 wygenerowane kiedykolwiek przez framework nie wypadło
    /// gałęzią zbiorczą.
    /// </summary>
    public const string Forbidden = "forbidden";

    /// <summary>
    /// Konto zablokowane po kolejnych nieudanych próbach logowania. Odrębny kod
    /// względem <see cref="Unauthorized"/> jest świadomy: użytkownik musi
    /// wiedzieć, że czekanie ma sens, a próbowanie kolejnych haseł nie.
    /// </summary>
    public const string AccountLocked = "account_locked";

    /// <summary>
    /// Przesłane dane nie przechodzą walidacji. Szczegóły — mapa „pole →
    /// komunikat" — jadą w <c>context</c> pod
    /// <see cref="ApiErrorContextKeys.Fields"/>.
    /// </summary>
    public const string ValidationError = "validation_error";

    /// <summary>Pozostałe statusy błędne wygenerowane przez framework.</summary>
    public const string HttpError = "http_error";
}

/// <summary>
/// Klucze w <c>context</c>, po których klient sięga świadomie — w odróżnieniu
/// od danych czysto diagnostycznych (<c>requestId</c>, <c>path</c>), których
/// nikt nie odczytuje programowo. Stała istnieje po to, żeby literał nie
/// powtarzał się po obu stronach granicy.
/// </summary>
public static class ApiErrorContextKeys
{
    /// <summary>
    /// Mapa „nazwa pola formularza → komunikat" przy
    /// <see cref="ApiErrorCodes.ValidationError"/>.
    /// </summary>
    public const string Fields = "fields";
}
