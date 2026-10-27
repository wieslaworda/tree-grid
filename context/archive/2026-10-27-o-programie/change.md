---
change_id: o-programie
title: Okno modalne z opisem aplikacji po zalogowaniu, przed widokiem drzewa
status: archived
created: 2026-10-27
updated: 2026-10-27
archived_at: 2026-10-27T06:10:51Z
---

## Notes

Po zalogowaniu się użytkownika przed załadowaniem formularza z prezentacją drzewa 
chcę wyświetlić w oknie modalnym opis aplikacji:

TreeGrid to aplikacja dla dyspozytorów, w której każdy samodzielnie układa sobie widok danych pomiarowych, bez zgłaszania zmian do innego zespołu.

Pracę zaczyna się od słownika obiektów, czyli listy elementów opisanych kodem i nazwą. Z tych obiektów buduje się własne drzewo: przeciąga się je z listy albo dodaje przyciskiem, a gotowe gałęzie można przenosić i zwijać. Drzewo może mieć wiele korzeni. Aplikacja pilnuje, żeby jego struktura była zawsze spójna: obiekt korzenia występuje w drzewie tylko raz, a pod jednym korzeniem obiekt się nie powtarza. Operacja łamiąca te zasady jest odrzucana w całości, z komunikatem o przyczynie.

Na podstawie drzewa tworzy się nazwany ekran. Wybiera się dla niego ziarno czasowe (5, 15 albo 60 minut) i domyślną listę kategorii danych. Ekran pokazuje tabelę, w której pierwsza kolumna to drzewo, druga to kategoria, a kolejne to punkty czasowe wybranej doby. Przy ziarnie 5-minutowym jest ich 288, i nadal da się je płynnie przewijać. Każdy węzeł drzewa może mieć własny zestaw kategorii, a wartości są pisane kolorem przypisanym kategorii. Zapisany ekran po ponownym otwarciu wygląda tak samo, a dobę wybiera się przy oglądaniu. Gdy drzewo się zmienia, ekrany, które z niego korzystają, nadążają za tymi zmianami.

Konto zakłada się loginem, hasłem i adresem e-mail, potwierdzonym kodem wysłanym na ten adres. Nowe konto dostaje na start przykładowe drzewo i ekran, żeby od razu było widać, jak działa aplikacja. Każdy użytkownik widzi wyłącznie własne drzewa i ekrany. Interfejs ma wariant jasny i ciemny, przełączany przez użytkownika.

TreeGrid jest wersją pokazową (MVP): wartości w punktach czasowych są generowane losowo, a nie pobierane z rzeczywistego źródła pomiarów.
