namespace Api.Data;

/// <summary>
/// Kategoria danych — pozycja „ograniczonej listy", z której S-04 przypisze
/// kategorie obiektom w drzewie (FR-006). Słownik jest wspólny dla wszystkich
/// kont, więc kategoria nie ma właściciela ani autora, a do czasu S-04 nie ma
/// też relacji z niczym.
/// </summary>
/// <remarks>
/// Kod występuje dwa razy z tego samego powodu co w <see cref="CatalogObject"/>:
/// <see cref="Code"/> jest trzymany tak, jak go wpisano (po obcięciu spacji na
/// brzegach), a unikalność pilnuje <see cref="NormalizedCode"/> z unikalnym
/// indeksem, bo kolacja <c>NOCASE</c> w SQLite nie składa polskich liter.
/// </remarks>
public sealed class Category
{
    /// <summary>Najdłuższy dopuszczalny kod, po obcięciu spacji na brzegach.</summary>
    public const int CodeMaxLength = 32;

    /// <summary>Najdłuższa dopuszczalna nazwa, po obcięciu spacji na brzegach.</summary>
    public const int NameMaxLength = 200;

    /// <summary>
    /// Klucz całkowity z autoinkrementacją — widok wskazuje wybraną kategorię
    /// adresem <c>/kategorie?id=12</c>, a identyfikator usuniętej kategorii nie
    /// wraca do obiegu.
    /// </summary>
    public int Id { get; set; }

    /// <summary>Kod w postaci wpisanej przez użytkownika, bez spacji na brzegach.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Kod po <see cref="DictionaryCode.Normalize"/> — i wyłącznie po niej. Ta
    /// sama funkcja liczy wartość do kontroli duplikatu w endpoincie, więc
    /// kontrola i indeks nie mogą się ze sobą rozjechać.
    /// </summary>
    public string NormalizedCode { get; set; } = string.Empty;

    /// <summary>Nazwa kategorii, bez spacji na brzegach.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Funkcja agregująca wybrana z listy. Wyłącznie zapisany atrybut: PRD
    /// wyklucza wartości wyliczane z punktów czasowych, więc nic jej dziś nie
    /// wykonuje.
    /// </summary>
    public AggregateFunction AggregateFunction { get; set; }
}

/// <summary>
/// Funkcje agregujące dostępne dla kategorii (MS-02). W bazie i w odpowiedzi
/// API zapisywane tekstem kanonicznym (<c>SUM</c> / <c>MIN</c> / <c>MAX</c>),
/// nigdy liczbą — zapis prowadzi <c>CategoryRules.FormatAggregateFunction</c>.
/// </summary>
public enum AggregateFunction
{
    Sum,
    Min,
    Max,
}
