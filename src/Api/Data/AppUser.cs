using Microsoft.AspNetCore.Identity;

namespace Api.Data;

/// <summary>
/// Konto dyspozytora. Typ użytkownika Identity w tym projekcie.
///
/// Klasa nie dokłada dziś żadnych własnych właściwości i to jest celowe —
/// istnieje jako punkt rozszerzenia. Od S-03 wskazuje ją klucz obcy węzłów
/// drzewa roboczego (<see cref="TreeNode.UserId"/>); nazwane ekrany z S-06
/// podepną się do tego samego typu, a przyszłe pola konta nie wymuszą podmiany
/// typu bazowego w całym modelu Identity.
///
/// Klucz zostaje domyślny, tekstowy. Zmiana jego typu wymusza generyczne
/// warianty wszystkich typów Identity (roli, oświadczeń, tokenów) i nie kupuje
/// tu niczego.
/// </summary>
public sealed class AppUser : IdentityUser;
