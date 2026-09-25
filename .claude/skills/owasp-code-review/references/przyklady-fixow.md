# Przykłady fixów per język

Konkretne, działające wzorce poprawek. **Nie wklejaj ich ślepo** — adaptuj do kontekstu, naming, frameworków i wersji bibliotek z audytowanego projektu.

## Python

### SQL Injection (Web/API)

```python
# ŹLE
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")

# DOBRZE — parametryzacja
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))

# DOBRZE — SQLAlchemy
session.execute(
    select(User).where(User.email == email)
)
```

### Command Injection

```python
# ŹLE
subprocess.run(f"ffmpeg -i {input_path} out.mp4", shell=True)

# DOBRZE — argumenty jako lista, bez shell
subprocess.run(
    ["ffmpeg", "-i", input_path, "out.mp4"],
    shell=False, check=True, timeout=60,
)
# + walidacja, że input_path mieści się w dozwolonym katalogu
```

### Niebezpieczna deserializacja

```python
# ŹLE
import pickle
obj = pickle.loads(request.body)

# DOBRZE — JSON ze schemą
from pydantic import BaseModel

class Payload(BaseModel):
    user_id: int
    action: Literal["create", "update", "delete"]

obj = Payload.model_validate_json(request.body)
```

### Hash haseł

```python
# ŹLE
import hashlib
hash = hashlib.sha256(password.encode()).hexdigest()

# DOBRZE — argon2
from argon2 import PasswordHasher
ph = PasswordHasher()  # parametry domyślne to dobry start, dotuningować pod sprzęt
hash = ph.hash(password)

try:
    ph.verify(stored_hash, password)
    if ph.check_needs_rehash(stored_hash):
        new_hash = ph.hash(password)
        # zapisz new_hash
except VerifyMismatchError:
    # niepoprawne hasło
    ...
```

### CSRF token & secure compare

```python
# ŹLE — porównanie podatne na timing attack
if request.form["token"] == session["csrf"]:
    ...

# DOBRZE
import hmac
if hmac.compare_digest(request.form["token"], session["csrf"]):
    ...
```

### SSRF protection

```python
import ipaddress, socket
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}

def safe_fetch(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("invalid scheme")
    host = parsed.hostname
    if not host:
        raise ValueError("no host")
    # resolve raz, użyj IP w requeście (uważać na rebinding)
    ip = socket.gethostbyname(host)
    addr = ipaddress.ip_address(ip)
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        raise ValueError("disallowed network")
    # użyj `ip` jako host + nagłówek Host: host
    return requests.get(
        f"{parsed.scheme}://{ip}{parsed.path}",
        headers={"Host": host},
        timeout=5, allow_redirects=False,
    )
```

## JavaScript / TypeScript (Node)

### XSS w Express + szablonach

```javascript
// ŹLE — bezpośrednie wstrzyknięcie
app.get('/profile', (req, res) => {
  res.send(`<h1>Witaj ${req.query.name}</h1>`);
});

// DOBRZE — szablon z autoescapingiem
// pug, ejs <%= %>, handlebars {{ }}
app.get('/profile', (req, res) => {
  res.render('profile', { name: req.query.name });
});
```

### Walidacja inputu — zod

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(["user", "editor"]),  // bez "admin" — nie przyjmujemy z requesta
});

app.post('/users', (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ errors: result.error.flatten() });
  // result.data jest bezpieczne i typed
});
```

### Helmet + bezpieczne nagłówki

```javascript
import helmet from "helmet";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (_, res) => `'nonce-${res.locals.cspNonce}'`],
      // brak 'unsafe-inline'
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

### Rate limiting

```javascript
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // klucz per IP + per username, żeby brute force na jednego usera nie wymagał wielu IP
  keyGenerator: (req) => `${req.ip}:${req.body.username ?? ""}`,
});

app.post("/login", loginLimiter, loginHandler);
```

### JWT — poprawne użycie

```javascript
import jwt from "jsonwebtoken";

// ŹLE
jwt.verify(token, secret);  // accept dowolnego algorytmu

// DOBRZE
jwt.verify(token, secret, {
  algorithms: ["HS256"],  // explicit, blokuje "none" i confusion attack
  issuer: "my-app",
  audience: "my-api",
  maxAge: "15m",
});
```

## Java / Kotlin

### SQL Injection (JDBC / JPA)

```java
// ŹLE
Statement st = conn.createStatement();
ResultSet rs = st.executeQuery("SELECT * FROM users WHERE email = '" + email + "'");

// DOBRZE
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE email = ?");
ps.setString(1, email);
ResultSet rs = ps.executeQuery();

// JPA / Hibernate — parametryzowane query
em.createQuery("SELECT u FROM User u WHERE u.email = :email", User.class)
  .setParameter("email", email)
  .getResultList();
```

### Spring Security — autoryzacja na metodzie

```kotlin
@PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.id")
fun getUser(@PathVariable userId: Long): UserDto {
    return userService.findById(userId)
}
```

### Hash haseł — Argon2

```java
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

@Bean
PasswordEncoder passwordEncoder() {
    return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
}
```

### Mass assignment protection

```kotlin
// ŹLE
@PutMapping("/users/{id}")
fun update(@PathVariable id: Long, @RequestBody user: User) = userRepo.save(user)
// User ma pole isAdmin → user może je nadpisać

// DOBRZE — osobne DTO
data class UpdateUserRequest(val name: String, val email: String)

@PutMapping("/users/{id}")
fun update(@PathVariable id: Long, @RequestBody @Valid req: UpdateUserRequest) {
    val u = userRepo.findById(id).orElseThrow()
    require(u.id == currentUserId() || isAdmin()) { "forbidden" }
    u.name = req.name; u.email = req.email
    userRepo.save(u)
}
```

## C# (.NET)

### SQL Injection (Dapper / EF Core)

```csharp
// ŹLE — string interpolation
var users = await conn.QueryAsync<User>(
    $"SELECT * FROM Users WHERE Email = '{email}'");

// DOBRZE — parametry
var users = await conn.QueryAsync<User>(
    "SELECT * FROM Users WHERE Email = @Email",
    new { Email = email });

// EF Core — LINQ jest bezpieczny
var users = await ctx.Users.Where(u => u.Email == email).ToListAsync();

// FromSqlInterpolated — bezpieczne dzięki FormattableString
var users = await ctx.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {email}")
    .ToListAsync();
```

### ASP.NET Core — autoryzacja policy-based

```csharp
services.AddAuthorization(options =>
{
    options.AddPolicy("CanEditOrder", policy =>
        policy.Requirements.Add(new OrderOwnerRequirement()));
});

[Authorize(Policy = "CanEditOrder")]
[HttpPut("orders/{id}")]
public Task<IActionResult> Update(Guid id, OrderUpdateDto dto) { ... }
```

## PHP

### SQL — PDO

```php
// ŹLE
$pdo->query("SELECT * FROM users WHERE email = '$email'");

// DOBRZE
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();
```

### Hash haseł

```php
// password_hash używa bcrypt domyślnie, w PHP 8.x można przejść na argon2id
$hash = password_hash($password, PASSWORD_ARGON2ID);

if (password_verify($input, $hash)) {
    if (password_needs_rehash($hash, PASSWORD_ARGON2ID)) {
        $new = password_hash($input, PASSWORD_ARGON2ID);
        // zapisz $new
    }
}
```

## Go

### SQL Injection

```go
// ŹLE
rows, _ := db.Query("SELECT * FROM users WHERE email = '" + email + "'")

// DOBRZE
rows, err := db.Query("SELECT * FROM users WHERE email = $1", email)
```

### Bezpieczny HTTP client (SSRF awareness)

```go
client := &http.Client{
    Timeout: 5 * time.Second,
    CheckRedirect: func(req *http.Request, via []*http.Request) error {
        return http.ErrUseLastResponse  // brak auto-redirect
    },
    Transport: &http.Transport{
        DialContext: (&net.Dialer{
            // walidacja IP w Control
            Control: controlDisallowPrivate,
        }).DialContext,
    },
}
```

### Constant-time compare

```go
import "crypto/subtle"

if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1 {
    // match
}
```

## Ruby (Rails)

### Mass assignment

```ruby
# Rails — strong parameters
def user_params
  params.require(:user).permit(:name, :email)  # nigdy :role, :admin
end
```

### SQL — Active Record

```ruby
# ŹLE
User.where("email = '#{params[:email]}'")

# DOBRZE
User.where(email: params[:email])
User.where("email = ?", params[:email])
```

## Swift (iOS)

### Keychain dla sekretów

```swift
import Security

func saveToken(_ token: String) throws {
    let data = token.data(using: .utf8)!
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: "auth_token",
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError(status) }
}
```

### URLSession — bezpieczna konfiguracja

```swift
let config = URLSessionConfiguration.default
config.tlsMinimumSupportedProtocolVersion = .TLSv12
config.httpShouldSetCookies = false
config.requestCachePolicy = .reloadIgnoringLocalCacheData  // dla wrażliwych danych
```

## Kotlin (Android)

### EncryptedSharedPreferences

```kotlin
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val prefs = EncryptedSharedPreferences.create(
    context,
    "secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

### Certificate pinning (OkHttp)

```kotlin
val pinner = CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .add("api.example.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")  // backup
    .build()
val client = OkHttpClient.Builder().certificatePinner(pinner).build()
```

## Wzorce uniwersalne

### Walidacja whitelistą zamiast blacklistą

```
ŹLE:  if (input.contains("<script>")) reject();   // tysiąc obejść
DOBRZE: if (!input.matches("^[a-zA-Z0-9-_]{1,50}$")) reject();
```

### Defense in depth — przykład loginu

1. Rate limit per IP + per username (warstwa 1).
2. CAPTCHA po 3 nieudanych próbach (warstwa 2).
3. Hasło w Argon2id (warstwa 3).
4. MFA dla wrażliwych operacji (warstwa 4).
5. Anomaly detection — nowy device / lokalizacja → step-up (warstwa 5).
6. Logging + alerting na masowe próby (warstwa 6).

Każda warstwa może paść; ważne, żeby wszystkie naraz nie padły jednym wektorem.

### Nigdy nie pisz własnej kryptografii

Jeśli kod wygląda jak custom crypto (XOR, własny KDF, własny MAC, sklejanie HMAC i AES ręcznie) — wymień to na standardową bibliotekę: libsodium, Tink, OS crypto.
