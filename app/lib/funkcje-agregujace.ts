/**
 * Funkcje agregujące kategorii — jedna lista dla formularza kategorii i dla
 * filtra kolumny w tabeli.
 *
 * Moduł świadomie **bez** sufiksu `.server`: czytają go komponenty
 * renderowane w przeglądarce, a moduł `.server` wywaliłby im build. Nie ma tu
 * więc nic, co dotyczy API poza samymi nazwami.
 *
 * Wartości muszą być identyczne z kanonicznym zapisem API
 * (`CategoryRules.FormatAggregateFunction` w
 * `src/Api/Categories/CategoryRules.cs`). Rozjazd nie daje błędu kompilacji,
 * tylko 400 z API przy zapisie albo `api_invalid_response` przy odczycie
 * listy.
 *
 * Funkcja jest wyłącznie zapisanym atrybutem kategorii — niczego nie liczy
 * (PRD, `Non-Goals`).
 */
export const FUNKCJE_AGREGUJACE = ["SUM", "MIN", "MAX"] as const;

export type FunkcjaAgregujaca = (typeof FUNKCJE_AGREGUJACE)[number];

/**
 * Wartość startowa formularza dodawania. Dotyczy wyłącznie widoku: API nie
 * podstawia żadnej wartości, a brak pola jest u niego błędem walidacji.
 */
export const FUNKCJA_DOMYSLNA: FunkcjaAgregujaca = "SUM";
