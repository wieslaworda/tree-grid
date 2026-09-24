namespace Api.Data;

/// <summary>
/// Przypisanie kategorii do węzła drzewa w obrębie jednego ekranu
/// (<see cref="Screen"/>) — jeden rekord na ekran × węzeł × kategorię, i jeden
/// wiersz gridu przy pełnym rozwinięciu. Ten sam węzeł może mieć w dwóch
/// ekranach na tym samym drzewie różne kategorie, więc przypisanie należy do
/// ekranu, a nie do węzła.
/// </summary>
/// <remarks>
/// Przypisania powstają z listy domyślnej ekranu
/// (<see cref="ScreenDefaultCategory"/>) przez
/// <c>Api.Screens.ScreenRules.Materialize</c>, a kolejność kategorii węzła jest
/// kolejnością tej listy, zapisaną w <see cref="Position"/>. Węzeł bez żadnego
/// rekordu to węzeł z zerem kategorii — nie „węzeł z domyślnymi".
///
/// Rekord wisi na stabilnym identyfikatorze węzła (<see cref="TreeNodeId"/>):
/// przeniesienie węzła go nie dotyka, a usunięcie węzła, ekranu albo kategorii
/// zdejmuje go kaskadą klucza obcego w bazie (<see cref="AppDbContext"/>) —
/// także wtedy, gdy przypisania nie są śledzone przez kontekst.
/// </remarks>
public sealed class ScreenNodeCategory
{
    public int ScreenId { get; set; }

    public Screen Screen { get; set; } = null!;

    /// <summary>Węzeł drzewa wskazywanego przez ekran.</summary>
    public int TreeNodeId { get; set; }

    public TreeNode Node { get; set; } = null!;

    public int CategoryId { get; set; }

    public Category Category { get; set; } = null!;

    /// <summary>
    /// Klucz porządku kategorii w obrębie węzła, nie indeks: przy zapisie jest
    /// pozycją kategorii na liście domyślnej, a kaskadowe zdjęcie kategorii
    /// zostawia lukę, której nikt nie przenumerowuje. Odczyt sortuje po tej
    /// wartości i nie zakłada ciągłości.
    /// </summary>
    public int Position { get; set; }
}
