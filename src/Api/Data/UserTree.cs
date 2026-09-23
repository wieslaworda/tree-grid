namespace Api.Data;

/// <summary>
/// Nazwane drzewo użytkownika — nagłówek, do którego należą węzły
/// (<see cref="TreeNode"/>). Konto ma dowolnie wiele drzew, a każde drzewo
/// dokładnie jednego właściciela (MS-05): węzeł nie ma własnego właściciela,
/// tylko drzewo, więc własność ma jedno źródło zamiast dwóch, które mogłyby się
/// rozjechać.
/// </summary>
/// <remarks>
/// Nagłówek celowo niesie wyłącznie identyfikator i nazwę (MS-03) — bez opisu,
/// dat, kolejności ani ustawień widoku. Nazwane ekrany z S-06 będą wskazywać
/// drzewo, a nie rozbudowywać jego nagłówek.
///
/// Nazwa występuje dwa razy z tego samego powodu co kod w
/// <see cref="CatalogObject"/>: <see cref="Name"/> jest trzymana tak, jak ją
/// wpisano (po obcięciu spacji na brzegach), a unikalność w obrębie konta
/// pilnuje <see cref="NormalizedName"/> z unikalnym indeksem, bo kolacja
/// <c>NOCASE</c> w SQLite nie składa polskich liter. Klasa nazywa się
/// <c>UserTree</c>, a nie <c>Tree</c>: w plikach przestrzeni <c>Api.Tree</c>
/// nazwa <c>Tree</c> rozwiązuje się do przestrzeni nazw.
/// </remarks>
public sealed class UserTree
{
    /// <summary>
    /// Najdłuższa dopuszczalna nazwa, po obcięciu spacji na brzegach — ta sama
    /// co nazwy pozycji słowników.
    /// </summary>
    public const int NameMaxLength = 200;

    /// <summary>
    /// Klucz całkowity z autoinkrementacją — adresy API wskazują drzewo
    /// identyfikatorem (<c>/trees/{treeId}/nodes</c>), a identyfikator
    /// usuniętego drzewa nie wraca do obiegu.
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// Właściciel drzewa — każde zapytanie o drzewo filtruje po nim, a węzły
    /// czyta się wyłącznie przez drzewo, które przeszło ten filtr.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    /// <summary>Nazwa w postaci wpisanej przez użytkownika, bez spacji na brzegach.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Nazwa po <c>Api.Tree.TreeNameRules.Normalize</c> — i wyłącznie po niej.
    /// Ta sama funkcja liczy wartość do kontroli duplikatu w endpoincie, więc
    /// kontrola i unikalny indeks <c>(UserId, NormalizedName)</c> nie mogą się
    /// ze sobą rozjechać.
    /// </summary>
    public string NormalizedName { get; set; } = string.Empty;

    /// <summary>Węzły drzewa; usunięcie drzewa usuwa je kaskadą.</summary>
    public ICollection<TreeNode> Nodes { get; set; } = [];
}
