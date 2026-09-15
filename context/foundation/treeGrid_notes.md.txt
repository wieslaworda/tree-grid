## treeGrid - MVP

### Główny problem
Aplikacja do tworzenia własnych ekranów  w których widok jest w postaci kontrolki drzewa połączonego z gridem.
Użytkownik buduje sam strukturę drzewiastą z dostępnych elementów (obiektów)

### Najmniejszy zestaw funkcjonalności
- Przeglądanie , edycja obiektów drzewa (dodawanie, edytowanie)
- Tworzenie struktury drzewiastej przez użytkownika z listy dostępnych obiektów
- Zapamiętanie utworzonej struktury w postaci ekrany 
- Prosty system kont użytkowników w którym każdy użytkownik widzi swoje ekrany
- Ustalenie listy atrybutów dla których będą prezentowane dane dla wybranego obiektu drzewa ( lista ograniczona )
- Prezentacja całej struktury drzewa z gridem. W pierwszej kolumnie struktura obiektów w drugiej widoczne atrybuty a w kolejnych punkty czasowe z danymi typu random
- Dynamiczna lista kolumn o 3 począwszy  generowana na podstawie ziarna czasowego : 5 minut/ 15 minut . godzina - dla wybranej doby
- Weryfikacja poprawności budowych struktur drzewa - brak zapętleń
- Podpowiadanie przeciągania całej struktury drzewa podrzędnego jeżeli obiekt na już strukturę drzewiastą 

### Co NIE wchodzi w zakres MVP
- Generowanie drzewa za pomocą przeciągania 
- Import listy obiektó z excela
- Aplikacja wed tylko na desktopie 

### Kryteria sukcesu
- Spełnienie wymagać na poprawną strukturę drzewiastą (brak zapętleń)
- Zapis i odczyt utworzonych ekranów