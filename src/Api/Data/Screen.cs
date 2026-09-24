namespace Api.Data;

/// <summary>
/// Nazwany ekran użytkownika (S-06) — prywatny zasób, który wskazuje jedno
/// z drzew konta (<see cref="UserTree"/>), niesie ziarno czasowe gridu
/// i dwie uporządkowane listy kategorii: listę domyślną
/// (<see cref="ScreenDefaultCategory"/>) i przypisania kategorii do węzłów
/// wskazanego drzewa (<see cref="ScreenNodeCategory"/>).
/// </summary>
/// <remarks>
/// Ekran wskazuje drzewo, a nie rozbudowuje jego nagłówka — nagłówek drzewa
/// zostaje przy identyfikatorze i nazwie (<see cref="UserTree"/>). Drzewo jest
/// ustalane przy tworzeniu ekranu i się nie zmienia; klucz obcy do drzewa ma
/// <c>Restrict</c>, więc drzewa wskazywanego przez ekran nie da się usunąć
/// nawet z pominięciem kontroli w endpoincie.
///
/// Przypisania są materializowane przy zapisie — po jednym rekordzie na
/// węzeł × kategorię — a nie wyliczane w locie z listy domyślnej: węzeł
/// z zerem kategorii musi dać się odróżnić od węzła, który jeszcze nie dostał
/// domyślnych (plan <c>zapisane-ekrany</c>, „Implementation Approach").
///
/// Nazwa występuje dwa razy z tego samego powodu co w <see cref="UserTree"/>:
/// <see cref="Name"/> jest trzymana tak, jak ją wpisano (po obcięciu spacji na
/// brzegach), a unikalność w obrębie konta pilnuje <see cref="NormalizedName"/>
/// z unikalnym indeksem, bo kolacja <c>NOCASE</c> w SQLite nie składa polskich
/// liter. Właściciel ekranu jest zapisany wprost (<see cref="UserId"/>), a nie
/// wyprowadzany z drzewa: każde zapytanie o ekran filtruje po nim tak samo jak
/// zapytanie o drzewo.
/// </remarks>
public sealed class Screen
{
    /// <summary>
    /// Najdłuższa dopuszczalna nazwa, po obcięciu spacji na brzegach — ta sama
    /// co nazwy drzew. Wiążący limit egzekwuje <c>Api.Screens.ScreenRules</c>,
    /// który czyta tę stałą.
    /// </summary>
    public const int NameMaxLength = 200;

    /// <summary>
    /// Klucz całkowity z autoinkrementacją — adresy API wskazują ekran
    /// identyfikatorem (<c>/screens/{id}</c>), a identyfikator usuniętego
    /// ekranu nie wraca do obiegu.
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// Właściciel ekranu — każde zapytanie o ekran filtruje po nim. Cudzy ekran
    /// jest dla API nieistniejący.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    public AppUser User { get; set; } = null!;

    /// <summary>
    /// Drzewo, którego węzły ekran pokazuje. Zawsze drzewo tego samego konta —
    /// pilnuje tego endpoint tworzenia, bo schemat relacji „to samo konto"
    /// nie unosi.
    /// </summary>
    public int TreeId { get; set; }

    public UserTree Tree { get; set; } = null!;

    /// <summary>Nazwa w postaci wpisanej przez użytkownika, bez spacji na brzegach.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Nazwa po <c>Api.Screens.ScreenRules.Normalize</c> — i wyłącznie po niej.
    /// Ta sama funkcja liczy wartość do kontroli duplikatu w endpoincie, więc
    /// kontrola i unikalny indeks <c>(UserId, NormalizedName)</c> nie mogą się
    /// ze sobą rozjechać.
    /// </summary>
    public string NormalizedName { get; set; } = string.Empty;

    /// <summary>
    /// Ziarno czasowe gridu w minutach: 5, 15 albo 60 — od niego zależy liczba
    /// kolumn doby (288, 96, 24). Dozwolone wartości pilnuje
    /// <c>Api.Screens.ScreenRules.TryValidateGrain</c>.
    /// </summary>
    public int GrainMinutes { get; set; }

    /// <summary>
    /// Lista kategorii domyślnych w kolejności <see cref="ScreenDefaultCategory.Position"/>;
    /// usunięcie ekranu usuwa ją kaskadą.
    /// </summary>
    public ICollection<ScreenDefaultCategory> DefaultCategories { get; set; } = [];

    /// <summary>
    /// Przypisania kategorii do węzłów drzewa, każde w kolejności
    /// <see cref="ScreenNodeCategory.Position"/> w obrębie węzła; usunięcie
    /// ekranu usuwa je kaskadą.
    /// </summary>
    public ICollection<ScreenNodeCategory> NodeCategories { get; set; } = [];
}
