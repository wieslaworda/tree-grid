namespace Api.Data;

/// <summary>
/// Obiekt słownika — materiał, z którego dyspozytor składa drzewo ekranu
/// (S-03). Słownik jest wspólny dla wszystkich kont, więc obiekt nie ma
/// właściciela ani autora.
///
/// Relacja rodzic–podobiekt jest wiele-do-wielu (ten sam obiekt bywa
/// podobiektem kilku rodziców), dlatego nie jest kluczem obcym w tej tabeli,
/// tylko osobną encją <see cref="CatalogObjectLink"/>.
/// </summary>
/// <remarks>
/// Kod występuje dwa razy i to jest celowe. <see cref="Code"/> jest trzymany
/// tak, jak go wpisano (po obcięciu spacji na brzegach), bo to on trafia na
/// ekran. Unikalność pilnuje <see cref="NormalizedCode"/> z unikalnym indeksem
/// — wzorem <c>Email</c> i <c>NormalizedEmail</c> z Identity. Kolacja
/// <c>NOCASE</c> w SQLite składa wyłącznie litery ASCII, więc „ł" i „Ł" byłyby
/// dla niej różnymi znakami, a dwa kody różniące się tylko wielkością polskiej
/// litery przeszłyby przez indeks.
/// </remarks>
public sealed class CatalogObject
{
    /// <summary>Najdłuższy dopuszczalny kod, po obcięciu spacji na brzegach.</summary>
    public const int CodeMaxLength = 32;

    /// <summary>Najdłuższa dopuszczalna nazwa, po obcięciu spacji na brzegach.</summary>
    public const int NameMaxLength = 200;

    /// <summary>
    /// Klucz całkowity z autoinkrementacją — widok wskazuje wybrany obiekt
    /// adresem <c>/obiekty?id=12</c>, a identyfikator usuniętego obiektu nie
    /// wraca do obiegu.
    /// </summary>
    public int Id { get; set; }

    /// <summary>Kod w postaci wpisanej przez użytkownika, bez spacji na brzegach.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Kod po <c>ObjectRules.NormalizeCode</c> — i wyłącznie po niej. Ta sama
    /// funkcja liczy wartość do kontroli duplikatu w endpoincie, więc kontrola
    /// i indeks nie mogą się ze sobą rozjechać.
    /// </summary>
    public string NormalizedCode { get; set; } = string.Empty;

    /// <summary>Nazwa obiektu, bez spacji na brzegach.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Relacje, w których ten obiekt jest rodzicem.</summary>
    public ICollection<CatalogObjectLink> Children { get; set; } = [];

    /// <summary>Relacje, w których ten obiekt jest podobiektem.</summary>
    public ICollection<CatalogObjectLink> Parents { get; set; } = [];
}
