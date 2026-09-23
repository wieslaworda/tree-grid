namespace Api.Data;

/// <summary>
/// Węzeł nazwanego drzewa użytkownika — jedno wystąpienie obiektu słownika
/// w jednym drzewie (<see cref="UserTree"/>). Ten sam obiekt może mieć w jednym
/// drzewie wiele wystąpień (w różnych gałęziach), więc tożsamością węzła jest
/// jego własne <see cref="Id"/>, a nie para „rodzic, obiekt".
/// </summary>
/// <remarks>
/// Węzeł jest kopią struktury z chwili dodania, a nie odwołaniem do relacji
/// słownika: dołączona gałąź (<see cref="CatalogObjectLink"/>) zostaje
/// rozpisana na osobne węzły, a późniejsza zmiana słownika jej nie rusza.
/// Z obiektu węzeł bierze wyłącznie tożsamość — kod i nazwę widok czyta ze
/// słownika na bieżąco.
///
/// Właścicielem węzła jest drzewo, a właścicielem drzewa — konto. Węzeł nie ma
/// własnego <c>UserId</c>: dwa źródła właściciela mogłyby się rozjechać, a jedno
/// nie może.
///
/// Niezmienniki, których schemat nie unosi — brak obiektu na własnej ścieżce
/// do korzenia, brak duplikatu wśród rodzeństwa, ciągłość <see cref="Position"/>
/// i limit <see cref="MaxNodesPerTree"/> — pilnują reguły
/// <c>Api.Tree.TreeRules</c> w transakcji endpointu, w obrębie jednego drzewa.
/// Klucze obce i ich zachowanie przy usuwaniu — w <see cref="AppDbContext"/>.
/// </remarks>
public sealed class TreeNode
{
    /// <summary>
    /// Najwięcej węzłów w jednym nazwanym drzewie — limit na drzewo, nie na
    /// konto. Rozwinięcie gałęzi ze słownika rozpisuje romb na kilka wystąpień,
    /// a łańcuch rombów — wykładniczo, więc limit jest liczony w trakcie
    /// rozwijania, a nie po nim. Utrzymuje też drzewo w rozmiarze, który grid
    /// z S-05 wyrenderuje w wirtualizacji.
    /// </summary>
    public const int MaxNodesPerTree = 2000;

    /// <summary>
    /// Klucz całkowity z autoinkrementacją — trwały punkt zaczepienia, na
    /// którym S-04 powiesi kategorie, a identyfikator usuniętego węzła nie wraca
    /// do obiegu.
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// Drzewo, do którego należy węzeł — każde zapytanie o węzły filtruje po
    /// nim, i to dopiero po sprawdzeniu, że drzewo należy do konta z żądania.
    /// </summary>
    public int TreeId { get; set; }

    public UserTree Tree { get; set; } = null!;

    /// <summary>Węzeł nadrzędny; <c>null</c> — najwyższy poziom drzewa.</summary>
    public int? ParentId { get; set; }

    public TreeNode? Parent { get; set; }

    public ICollection<TreeNode> Children { get; set; } = [];

    /// <summary>Obiekt słownika, którego wystąpieniem jest węzeł.</summary>
    public int ObjectId { get; set; }

    public CatalogObject Object { get; set; } = null!;

    /// <summary>
    /// Indeks od 0 wśród rodzeństwa (węzłów o tym samym
    /// <see cref="ParentId"/>), ciągły po każdej operacji — przenumerowanie
    /// prowadzi endpoint w tej samej transakcji co zmianę.
    /// </summary>
    public int Position { get; set; }
}
