namespace Api.Data;

/// <summary>
/// Pozycja listy kategorii domyślnych ekranu (<see cref="Screen"/>) — kategorie,
/// które dostaje każdy węzeł drzewa przy tworzeniu ekranu. Kategoria występuje
/// na liście co najwyżej raz,
/// więc kluczem jest para (<see cref="ScreenId"/>, <see cref="CategoryId"/>).
/// </summary>
/// <remarks>
/// Kolejność listy to kolejność, w jakiej użytkownik wybrał kategorie przy
/// tworzeniu ekranu, zapisana w <see cref="Position"/>. Ta sama kolejność
/// przechodzi na przypisania węzłów (<see cref="ScreenNodeCategory"/>), a z nich
/// na kolejność wierszy gridu.
///
/// Usunięcie ekranu i usunięcie kategorii ze słownika zdejmują pozycję kaskadą
/// klucza obcego (<see cref="AppDbContext"/>).
/// </remarks>
public sealed class ScreenDefaultCategory
{
    public int ScreenId { get; set; }

    public Screen Screen { get; set; } = null!;

    public int CategoryId { get; set; }

    public Category Category { get; set; } = null!;

    /// <summary>
    /// Klucz porządku na liście, nie indeks: przy zapisie ekranu pozycje są
    /// ciągłe od 0, ale kaskadowe zdjęcie kategorii zostawia w nich lukę i nikt
    /// ich nie przenumerowuje. Odczyt sortuje po tej wartości i nie zakłada
    /// ciągłości.
    /// </summary>
    public int Position { get; set; }
}
