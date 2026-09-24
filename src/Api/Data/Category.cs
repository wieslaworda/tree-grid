namespace Api.Data;

/// <summary>
/// Kategoria danych — pozycja „ograniczonej listy", z której ekran (S-06)
/// przypisuje kategorie węzłom swojego drzewa (FR-006): listą domyślną
/// (<see cref="ScreenDefaultCategory"/>) i przypisaniami per węzeł
/// (<see cref="ScreenNodeCategory"/>). Słownik jest wspólny dla wszystkich
/// kont, więc kategoria nie ma właściciela ani autora. Usunięcie kategorii
/// zdejmuje ją z ekranów kaskadą, chyba że jest jedyną domyślną
/// któregokolwiek ekranu — wtedy <c>DELETE /categories/{id}</c> odmawia.
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

    /// <summary>Długość zapisu <c>#RRGGBB</c>.</summary>
    public const int ColorLength = 7;

    /// <summary>
    /// Kolor wierszy sprzed kolumny <see cref="Color"/> (wartość domyślna
    /// migracji <c>CategoryColorAndOrder</c>). Formularz dodawania startuje
    /// z tego samego koloru (<c>KOLOR_DOMYSLNY</c> w
    /// <c>app/components/FormularzKategorii.tsx</c>), ale API go nie
    /// podstawia — brak koloru w żądaniu jest błędem walidacji.
    /// </summary>
    public const string DefaultColor = "#1677FF";

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

    /// <summary>
    /// Kolor kategorii zapisem <c>#RRGGBB</c> wielkimi literami — postać
    /// kanoniczną ustala <c>CategoryRules.TryNormalizeColor</c>. Bez kanału
    /// przezroczystości: formularz go nie oferuje, a API go nie przyjmuje.
    /// </summary>
    public string Color { get; set; } = DefaultColor;

    /// <summary>
    /// Kolejność kategorii — dowolna liczba całkowita, bez wymogu ciągłości
    /// ani unikalności. Dziś wyłącznie zapisany atrybut: lista słownika nadal
    /// sortuje po kodzie.
    /// </summary>
    public int SortOrder { get; set; }
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
