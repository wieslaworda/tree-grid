# OWASP Mobile Top 10:2024

Dotyczy aplikacji natywnych iOS/Android oraz hybryd (React Native, Flutter, Xamarin, Capacitor). **Źródło prawdy:** https://owasp.org/www-project-mobile-top-10/

## M1:2024 — Improper Credential Usage

**Co to:** Hardcoded credentialsy, klucze w kodzie aplikacji, sekrety w plain text na urządzeniu.

**Sygnały:**
- API keys w kodzie / `BuildConfig` / `Info.plist` / strings.xml.
- Klucze odzyskiwalne przez reverse engineering APK/IPA.
- Hasła przechowywane w `SharedPreferences` / `NSUserDefaults` plaintext.
- Brak rotacji kluczy.
- Klucz symetryczny do szyfrowania backup'u embedded w aplikacji.

**Fix:**
- Sekrety w secure storage: Android Keystore, iOS Keychain (z odpowiednim accessibility level).
- Sekrety per-instalacja generowane przy pierwszym uruchomieniu, nie hardcoded.
- API: tożsamość urządzenia + krótkotrwałe tokeny zamiast statycznych kluczy.
- Code obfuscation (R8/ProGuard, Swift Shield) jako defense-in-depth, nigdy jako pojedyncza linia obrony.

---

## M2:2024 — Inadequate Supply Chain Security

To samo co A03:2025 Web, w kontekście mobilnym:
- SDK z reklam / analityki ze złą reputacją.
- Outdated AndroidX / Cocoapods dependencies.
- Builds z niezaufanych CI machines.
- Brak weryfikacji integralności po stronie store (sideloading risk).

**Fix:**
- Audit SDK przed dodaniem (uprawnienia, dane wysyłane).
- Dependabot / Renovate dla mobile (Gradle, SwiftPM, Cocoapods).
- Reproducible builds.
- Play Integrity API / DeviceCheck / App Attest dla weryfikacji integralności.

---

## M3:2024 — Insecure Authentication/Authorization

**Sygnały:**
- Sesja zarządzana client-side bez weryfikacji server-side.
- Biometria jako jedyny czynnik (zła implementacja: TouchID/FaceID zwraca `true`, bez sprawdzenia w secure enclave).
- „Remember me" jako plaintext token.
- Reset hasła przez SMS bez rate limita (SIM swap).
- Brak step-up authentication dla wrażliwych akcji.

**Fix:**
- Server-side session/JWT, krótkie expiracje.
- Biometria z `BiometricPrompt` (Android) / `LAContext` (iOS) z fallbackiem przez urządzenie, **NIE** jako zamiennik server-side auth.
- WebAuthn / passkeys gdzie to możliwe.
- Step-up auth dla wrażliwych operacji (np. zmiana hasła, dodanie urządzenia).

---

## M4:2024 — Insufficient Input/Output Validation

**Sygnały:**
- Deep links (`myapp://...`) przyjmujące dowolne parametry bez walidacji → trigger akcji.
- WebView z `javascriptInterface` bez whitelisty domen.
- `eval`-podobne (`evaluateJavascript`, `loadDataWithBaseURL`).
- SQL injection w lokalnym SQLite.
- Output do WebView bez escapowania (XSS w mobilnej WebView).

**Fix:**
- Walidacja deep linków po stronie aplikacji (signed deeplinks, intent verification).
- WebView: `setJavaScriptEnabled(false)` jeśli niepotrzebne; jeśli potrzebne → `addJavascriptInterface` minimalne API, sprawdzanie origin.
- Parametryzowane zapytania w SQLite.
- HTTPS-only navigation w WebView.

---

## M5:2024 — Insecure Communication

**Sygnały:**
- `http://` zamiast `https://`.
- `ATS` (App Transport Security) wyłączone na iOS / `NetworkSecurityConfig` na Androidzie z `cleartextTrafficPermitted=true`.
- Brak certificate pinning dla wysokoryzykownych połączeń.
- Akceptowanie self-signed certyfikatów (`trustAllHosts`).
- Brak walidacji hosta (`HostnameVerifier` zawsze true).

**Fix:**
- TLS 1.2+ wymuszone, ATS w trybie strict.
- Certificate pinning (TrustKit, OkHttp CertificatePinner) dla krytycznych endpointów + plan rotacji.
- Network Security Config z wyraźną whitelistą domen.
- Public Key Pinning lepiej niż Certificate Pinning (rotacja certów).

---

## M6:2024 — Inadequate Privacy Controls

**Sygnały:**
- Zbieranie danych poza tym, co zadeklarowane w Privacy Manifest / Play Data safety section.
- Brak consent management (GDPR, CCPA).
- Cross-app tracking bez przyzwolenia (iOS: ATT, Android: AAID + UMP).
- PII w analytics events.

**Fix:**
- Privacy Manifest (iOS 17+) wypełniony zgodnie z prawdą.
- ATT prompt na iOS przed jakimkolwiek tracking ID.
- Consent management (UMP, Didomi, OneTrust).
- Data minimization — zbieraj tylko to, co naprawdę potrzebne.

---

## M7:2024 — Insufficient Binary Protections

**Sygnały:**
- Brak code obfuscation (kod łatwy do reverse engineeringu).
- Brak detekcji root/jailbreak.
- Brak detekcji debuggera / emulatora w wrażliwych aplikacjach (banking, healthcare).
- Brak runtime application self-protection (RASP).
- Możliwość zmiany kodu (resigning, instrumentation przez Frida) bez detekcji.

**Fix:**
- R8 / ProGuard z aggressive obfuscation.
- Anti-tampering checks (signature verification at runtime).
- Play Integrity API (Android), App Attest (iOS) — server-side weryfikacja.
- RootBeer / IOSSecuritySuite jako drugorzędne warstwy (łatwe do ominięcia, ale podnoszą poprzeczkę).
- **Te kontrole nie są ostateczną obroną** — krytyczna logika nadal po stronie serwera.

---

## M8:2024 — Security Misconfiguration

**Sygnały:**
- Debug build w produkcji / `debuggable=true`.
- Backup włączony bez wyłączenia wrażliwych danych (`allowBackup=true`, brak `fullBackupContent`).
- Exported activities/services/receivers bez wymagania permission.
- iOS: URL schemes bez weryfikacji source.
- Logi developmentowe (`Log.d`, `print`) z wrażliwymi danymi w release build.

**Fix:**
- `debuggable=false` w release, walidacja w CI.
- `android:allowBackup="false"` lub explicit content rules.
- Eksportowane komponenty: `android:exported` explicit, z permission jeśli potrzebne.
- iOS: Universal Links zamiast custom URL schemes gdy to możliwe; walidacja source w `application(_:open:options:)`.
- Logger który strip'uje w release (`Timber` + ProGuard rule).

---

## M9:2024 — Insecure Data Storage

**Sygnały:**
- Dane wrażliwe w `SharedPreferences` / `NSUserDefaults` / `localStorage` (WebView) plaintext.
- Pliki na external storage bez szyfrowania.
- SQLite bez szyfrowania (SQLCipher dla bardzo wrażliwych przypadków).
- Cache zawierający wrażliwe dane (HTTP cache, image cache z PII).
- Screenshots zawierają wrażliwy stan ekranu (brak `FLAG_SECURE` na Android / `isHidden` na iOS przy resign).
- Clipboard z wrażliwymi danymi bez czyszczenia po czasie.

**Fix:**
- Android: EncryptedSharedPreferences (Jetpack Security), Keystore-backed.
- iOS: Keychain z `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- Szyfrowane DB tylko gdy uzasadnione (overhead vs ryzyko).
- `FLAG_SECURE` na ekranach wrażliwych (Android), maskowanie podczas backgroundingu (iOS).
- Clipboard z auto-clear (np. po 60s).

---

## M10:2024 — Insufficient Cryptography

**Sygnały:**
- DES, RC4, MD5, SHA1 do bezpieczeństwa.
- AES w trybie ECB.
- Brak IV / IV stały / IV przewidywalny.
- Klucze AES wyprowadzone z słabego źródła (`Math.random`, timestamp).
- Implementacja własnej kryptografii.
- Klucze poza Keystore/Keychain.

**Fix:**
- AES-GCM (AEAD) lub ChaCha20-Poly1305 z losowym IV per szyfrowanie.
- Klucze w Keystore / Keychain — operacje kryptograficzne w hardware (StrongBox / Secure Enclave gdy dostępne).
- Argon2id dla derivacji kluczy z passphrase.
- Standardowe biblioteki (Tink, libsodium) zamiast własnych.

---

## Specyficzne dla hybryd

- **React Native:** uważać na `react-native-async-storage` (nieszyfrowane). Bridge między JS i native jako attack surface.
- **Flutter:** podobnie, sekrety w Dart kodzie są w bundle — używać platform channels do Keystore/Keychain.
- **Capacitor / Cordova:** plugin'y JS mają dostęp do natywnych API — audyt każdego plugin.
- **WebView-based:** wszystkie problemy Web Top 10 + mobile-specific (deep links, JS bridges).
