using Api.Data;

namespace Api.Objects;

/// <summary>
/// Reguły słownika obiektów jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF. Endpointy (<see cref="ObjectEndpoints"/>) czytają stan i
/// odwzorowują wynik na odpowiedź, a same decyzje zapadają tutaj — dzięki temu
/// sprawdza je test jednostkowy.
///
/// <see cref="FindCycle"/> nie jest regułą drzewa użytkownika (S-03), choć
/// oba mówią o „zapętleniu". Tu cyklem jest pętla w grafie obiektów słownika;
/// w drzewie — obiekt na ścieżce do korzenia <b>jednego wystąpienia</b>, a ten
/// sam obiekt wolno postawić w różnych gałęziach (A pod B tu, B pod A tam).
/// Grafowa kontrola odrzucałaby takie poprawne drzewa, więc drzewo ma własną
/// regułę po ścieżce przodków w <c>Api.Tree.TreeRules</c>.
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

    /// <summary>
    /// Sprawdza, czy nadanie obiektowi <paramref name="objectId"/> zestawu
    /// podobiektów <paramref name="newChildIds"/> zamknie cykl, i zwraca jego
    /// ścieżkę.
    /// </summary>
    /// <returns>
    /// <c>null</c> — brak cyklu; w przeciwnym razie identyfikatory od
    /// <paramref name="objectId"/> z powrotem do <paramref name="objectId"/>,
    /// np. <c>[1, 7, 1]</c>.
    /// </returns>
    /// <remarks>
    /// Graf, po którym idzie przejście, to <paramref name="childrenByParent"/>
    /// z dziećmi edytowanego obiektu zastąpionymi nowym zestawem: wpis
    /// <paramref name="objectId"/> w słowniku jest ignorowany, bo opisuje stan
    /// sprzed zapisu.
    ///
    /// Szukane są wyłącznie cykle przechodzące przez edytowany obiekt. Przed
    /// zapisem graf jest acykliczny (pilnuje tego właśnie ta reguła), a zapis
    /// zmienia tylko krawędzie wychodzące z tego jednego obiektu — każdy nowy
    /// cykl musi więc przez niego przechodzić.
    ///
    /// Podobiekt równy samemu obiektowi to cykl długości 1 (<c>[A, A]</c>).
    /// Romb (dwie ścieżki do tego samego potomka) cyklem nie jest: węzeł raz
    /// przeszukany bez znalezienia <paramref name="objectId"/> nie jest
    /// odwiedzany ponownie, co przy okazji ogranicza przejście do O(V + E).
    /// </remarks>
    internal static IReadOnlyList<int>? FindCycle(
        int objectId,
        IReadOnlyCollection<int> newChildIds,
        IReadOnlyDictionary<int, IReadOnlyCollection<int>> childrenByParent)
    {
        var exhausted = new HashSet<int>();

        // Jawny stos zamiast rekurencji: głębokość przejścia to najdłuższy
        // łańcuch w grafie, a `StackOverflowException` w .NET nie da się
        // złapać — kończy cały proces API. Ramka to węzeł bieżącej ścieżki
        // i jego dzieci jeszcze do sprawdzenia, więc stos od dna jest drogą
        // od `objectId` do właśnie badanego węzła.
        var stack = new Stack<(int Node, IEnumerator<int> Children)>();
        stack.Push((objectId, newChildIds.GetEnumerator()));

        while (stack.Count > 0)
        {
            var children = stack.Peek().Children;

            if (!children.MoveNext())
            {
                stack.Pop();

                continue;
            }

            var child = children.Current;

            if (child == objectId)
            {
                return [.. stack.Reverse().Select(frame => frame.Node), objectId];
            }

            if (!exhausted.Add(child))
            {
                continue;
            }

            stack.Push((
                child,
                childrenByParent.TryGetValue(child, out var grandchildren)
                    ? grandchildren.GetEnumerator()
                    : Enumerable.Empty<int>().GetEnumerator()));
        }

        return null;
    }

    /// <summary>
    /// Warunek usunięcia: obiekt nie ma ani obiektu nadrzędnego, ani
    /// podobiektu. Usunięcie obiektu z rodzicem wycięłoby go z gałęzi, w której
    /// występuje; usunięcie obiektu z podobiektami — zerwałoby gałąź pod nim.
    /// Archiwizacji ani usuwania kaskadowego ten plaster nie przewiduje.
    /// </summary>
    internal static bool CanDelete(int parentCount, int childCount)
        => parentCount == 0 && childCount == 0;
}
