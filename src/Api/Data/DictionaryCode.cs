namespace Api.Data;

/// <summary>
/// Reguła kodu wspólna dla wszystkich słowników (obiektów i kategorii). Mieszka
/// poza modułami słowników, bo nie ma w niej nic ani obiektowego, ani
/// kategoriowego — a dwie kopie tej samej reguły rozjechałyby unikalność kodu
/// w obu słownikach przy pierwszej zmianie jednej z nich.
/// </summary>
internal static class DictionaryCode
{
    /// <summary>
    /// Postać kodu, po której pozycje słownika są porównywane: bez spacji na
    /// brzegach i wielkimi literami. Jedno źródło dla kontroli duplikatu
    /// w endpoincie i dla kolumny z unikalnym indeksem — gdyby liczyły ją dwa
    /// miejsca, kontrola mogłaby przepuścić kod, na którym indeks rzuci
    /// wyjątkiem.
    /// </summary>
    /// <remarks>
    /// Nigdy kolacja bazy: <c>NOCASE</c> w SQLite składa wyłącznie litery
    /// ASCII. <c>ToUpperInvariant</c>, a nie <c>ToUpper</c>, bo tożsamość kodu
    /// nie może zależeć od ustawień regionalnych maszyny, na której działa API.
    /// </remarks>
    internal static string Normalize(string code) => code.Trim().ToUpperInvariant();
}
