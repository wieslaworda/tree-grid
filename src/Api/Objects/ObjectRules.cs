using Api.Data;

namespace Api.Objects;

/// <summary>
/// Reguły słownika obiektów jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF. Endpointy (<see cref="ObjectEndpoints"/>) czytają stan i
/// odwzorowują wynik na odpowiedź, a same decyzje zapadają tutaj — dzięki temu
/// sprawdza je test jednostkowy.
///
/// Obiekt to wyłącznie kod i nazwa: słownik nie niesie relacji między
/// obiektami, więc nie ma tu ani grafu, ani kontroli cyklu. Zapętlenie jest
/// regułą drzewa użytkownika — obiekt na ścieżce do korzenia jednego
/// wystąpienia — i mieszka w <c>Api.Tree.TreeRules</c>.
/// </summary>
internal static class ObjectRules
{
    /// <summary>
    /// Postać kodu, po której obiekty są porównywane. Sama reguła jest wspólna
    /// dla wszystkich słowników i mieszka w <see cref="DictionaryCode"/>; ta
    /// metoda zostaje jako jej delegacja, żeby wywołania w module obiektów
    /// czytały się tak jak dotąd.
    /// </summary>
    internal static string NormalizeCode(string code) => DictionaryCode.Normalize(code);
}
