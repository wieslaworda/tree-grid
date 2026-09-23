import { Alert, Button, ConfigProvider, Form as AntForm, Input } from "antd";
import {
  Form as RouterForm,
  Link,
  data,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";

import type { ApiErrorBody } from "~/lib/api.server";
import {
  AUTH_LOGIN_PATH,
  HOME_ROUTE,
  createUserSession,
  getUser,
  requestAccount,
  requireSameOrigin,
} from "~/lib/auth.server";

import type { Route } from "./+types/logowanie";

/**
 * Pola, które ten formularz wysyła. Lista służy jednej rzeczy: rozpoznaniu,
 * czy błąd z API dał się w całości rozpisać pod pola, czy zostało coś, co musi
 * pójść do banera. Nazwy są te same co w `AuthFormFields`
 * (`src/Api/Auth/AuthEndpoints.cs`).
 */
const POLA_FORMULARZA = ["email", "password"] as const;

/**
 * Motyw ekranu uwierzytelniania — jedyne miejsce w aplikacji, gdzie komponenty
 * antd stoją na szkle, a nie na białym tle.
 *
 * Tokeny, a nie klasy narzędziowe, bo pole formularza ma części, do których
 * `className` nie sięga: wpisywany tekst, placeholder, ikona podglądu hasła
 * i obramowanie w stanie `:focus` rysowane przez antd z tokenów. Ustawienie
 * ich klasami wymagałoby celowania w wewnętrzne selektory antd, czyli
 * zależności od jego szczegółu implementacyjnego.
 *
 * `ConfigProvider` jest tu **zagnieżdżony** w tym z `app/root.tsx`, a nie
 * postawiony w jego miejsce: zagnieżdżenie dziedziczy lokalizację, więc
 * `pl_PL` — a z nim polskie komunikaty walidacji — obowiązuje dalej bez
 * powtarzania konfiguracji.
 */
const MOTYW_SZKLA = {
  token: {
    colorText: "#ffffff",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.55)",
    colorIcon: "rgba(255, 255, 255, 0.55)",
    colorIconHover: "#ffffff",
    colorBgContainer: "rgba(255, 255, 255, 0.14)",
    colorBorder: "rgba(255, 255, 255, 0.26)",
    colorError: "#ffd9d9",
    borderRadius: 12,
    controlHeight: 46,
    fontSize: 15,
  },
  components: {
    Input: {
      activeBg: "rgba(255, 255, 255, 0.2)",
      hoverBg: "rgba(255, 255, 255, 0.18)",
      hoverBorderColor: "rgba(255, 255, 255, 0.45)",
      activeBorderColor: "rgba(255, 255, 255, 0.7)",
      activeShadow: "0 0 0 3px rgba(255, 255, 255, 0.12)",
      paddingInline: 16,
    },
    Form: {
      labelColor: "rgba(255, 255, 255, 0.85)",
      labelFontSize: 13,
      itemMarginBottom: 20,
      verticalLabelPadding: "0 0 6px",
    },
  },
} as const;

export function meta() {
  return [{ title: "Logowanie — TreeGrid" }];
}

/**
 * Ekran logowania jest — obok rejestracji — jedynym widokiem dostępnym bez
 * sesji. Stoi **poza** layoutem `routes/chronione.tsx` (`app/routes.ts`), bo
 * brama, która odsyła tutaj, odesłałaby tu również z tego adresu.
 *
 * Musi zwracać 200 bez sesji nie tylko dla użytkownika: na tym opiera się
 * wykrywanie gotowości w `start-prod-tunnel.ps1:210`, które po wprowadzeniu
 * bramy dostaje z `/` przekierowanie i ocenia status strony docelowej.
 */
export async function loader({ request }: Route.LoaderArgs) {
  // Zalogowany nie ma po co oglądać formularza logowania — a gdyby go wysłał,
  // zamieniłby ważną sesję na nową bez żadnego powodu.
  if ((await getUser(request)) !== null) {
    throw redirect(HOME_ROUTE);
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);

  const formData = await request.formData();

  // Nazwy pól muszą być identyczne z `AuthFormFields` w
  // `src/Api/Auth/AuthEndpoints.cs` — po nich API adresuje komunikaty
  // walidacji. Zgodności nie sprawdza ani kompilator, ani `npm run typecheck`:
  // rozjazd nie daje błędu, tylko komunikat, który nigdy się nie pokazuje.
  const result = await requestAccount(AUTH_LOGIN_PATH, {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) {
    // Koperta API idzie do formularza nietknięta, razem ze statusem. To ona
    // niesie `code` (np. `account_locked`) i mapę naruszeń pól.
    return data(result.error, { status: result.status });
  }

  return createUserSession(result.user, HOME_ROUTE);
}

/**
 * Dwa komponenty o nazwie `Form` stoją tu obok siebie i mają rozłączne role.
 *
 * `RouterForm` jako jedyny renderuje element `<form>` — dzięki temu wysyłka
 * idzie zwykłym POST-em do `action` wyżej. `AntForm` dostaje `component={false}`
 * i nie renderuje niczego: daje wyłącznie kontekst, z którego `Form.Item`
 * bierze układ, etykiety i komunikaty walidacji. Gdyby renderował własny
 * `<form>`, przechwyciłby wysyłkę (`preventDefault` i `onFinish` zamiast
 * żądania), więc `action` nigdy by się nie wykonał — a dwóch elementów `form`
 * i tak nie wolno zagnieżdżać.
 *
 * Z tego samego powodu walidacja w przeglądarce jest podzielona: wysyłkę
 * zatrzymują atrybuty `required` i `type` na samym polu, bo przy niczym
 * nieprzechwyconym zdarzeniu tylko natywna walidacja ma jak to zrobić, a
 * widoczny komunikat pod polem rysują reguły `Form.Item`. Obie warstwy
 * sprawdzają wyłącznie kształt — regułami wiążącymi są te z API i to jego
 * komunikaty trafiają pod pola po odpowiedzi.
 *
 * Wygląd opiera się na kolejności warstw CSS z `app/app.css`: `utilities` stoi
 * nad `antd`, więc klasa Tailwinda na komponencie antd wygrywa bez `!important`
 * i bez celowania w wewnętrzne selektory. Wszystko, czego klasa nie dosięga,
 * idzie tokenami w `MOTYW_SZKLA`.
 */
export default function Logowanie() {
  const blad = useActionData<ApiErrorBody>();
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  // `!== "idle"` obejmuje także fazę po odpowiedzi `action`: udane logowanie
  // kończy się przekierowaniem, a formularz zostaje na ekranie do czasu
  // wczytania widoku docelowego. Zwolnienie przycisku wcześniej pokazywałoby
  // gotowość do ponownej wysyłki, której nie ma.
  const nawigacja = useNavigation();
  const wysylanie = nawigacja.state !== "idle";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#9d8df6_0%,#8672ec_38%,#6a52d8_70%,#4c36ad_100%)] p-6">
      {/* Rozmyte plamy światła pod kartą. Czysto dekoracyjne, stąd `aria-hidden`
          — czytnik ekranu nie ma czego o nich powiedzieć. Mają też rolę
          techniczną: `backdrop-blur` bez zróżnicowanego tła nie daje widocznego
          efektu, więc to one dostarczają szkłu coś do rozmycia. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-300/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-32 h-96 w-96 rounded-full bg-violet-900/40 blur-3xl"
      />

      <div className="relative w-full max-w-md rounded-3xl border border-white/25 bg-white/10 p-8 shadow-[0_8px_32px_rgba(31,38,135,0.25)] backdrop-blur-2xl sm:p-10">
        <h1 className="text-center text-3xl font-bold tracking-tight text-white">
          Logowanie
        </h1>
        <p className="mt-2 mb-8 text-center text-sm text-white/70">
          Miło Cię znowu widzieć
        </p>

        <ConfigProvider theme={MOTYW_SZKLA}>
          {ogolny === undefined ? null : (
            <Alert
              className="mb-6 rounded-xl border-white/30 bg-red-500/30 backdrop-blur-sm"
              type="error"
              showIcon
              message={<span className="text-white">{ogolny}</span>}
            />
          )}

          <RouterForm method="post">
            <AntForm component={false} layout="vertical" requiredMark={false}>
              {/*
                `name` stoi w dwóch miejscach na każde pole i nie jest to
                powtórzenie. To w `Form.Item` adresuje pole w stanie antd i nie
                zostawia śladu w DOM-ie; to na `Input` jest atrybutem elementu,
                a `request.formData()` czyta wyłącznie atrybuty. Bez drugiego pole
                wychodzi z formularza puste — bez żadnego błędu.
              */}
              <AntForm.Item
                label="Adres e-mail"
                name="email"
                rules={[
                  // Bez `message`: tekst „pole wymagane" bierze się z lokalizacji
                  // `pl_PL` ustawionej w `ConfigProvider` (`app/root.tsx:55`).
                  { required: true },
                  // Tu wprost, bo domyślny tekst z lokalizacji mówi o „poprawnej
                  // wartości dla typu email", czyli o typie, a nie o adresie.
                  { type: "email", message: "Podaj poprawny adres e-mail." },
                ]}
                validateStatus={pola.email === undefined ? undefined : "error"}
                help={pola.email}
              >
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="ty@przyklad.pl"
                  required
                />
              </AntForm.Item>

              <AntForm.Item
                label="Hasło"
                name="password"
                rules={[{ required: true }]}
                validateStatus={
                  pola.password === undefined ? undefined : "error"
                }
                help={pola.password}
              >
                <Input.Password
                  name="password"
                  autoComplete="current-password"
                  placeholder="Twoje hasło"
                  required
                />
              </AntForm.Item>

              <AntForm.Item className="mt-8 mb-0">
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  loading={wysylanie}
                  disabled={wysylanie}
                  className="h-12 rounded-xl border-0 bg-linear-to-r from-sky-400 to-indigo-600 text-base font-semibold shadow-lg shadow-indigo-900/30"
                >
                  Zaloguj się
                </Button>
              </AntForm.Item>
            </AntForm>
          </RouterForm>
        </ConfigProvider>

        <p className="mt-8 text-center text-sm text-white/70">
          Nie masz konta?{" "}
          <Link
            to="/rejestracja"
            className="font-semibold text-white underline-offset-4 hover:underline"
          >
            Załóż konto
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Wyciąga mapę „pole → komunikat" z `context` koperty błędu. `context` jest
 * z definicji workiem na dane pomocnicze, więc jego zawartość jest sprawdzana,
 * a nie zakładana — błąd inny niż walidacyjny (np. `api_unreachable`) nie ma
 * tam żadnych pól i ma wyjść pustą mapą, a nie wyjątkiem.
 */
function naruszeniaPol(
  blad: ApiErrorBody | undefined,
): Record<string, string | undefined> {
  const fields = blad?.error.context.fields;

  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, string>)
    : {};
}

/**
 * Komunikat do banera nad formularzem, albo `undefined`, gdy baner nie ma czego
 * pokazać. Naruszenie konkretnego pola ma swoje miejsce pod tym polem i
 * powtórzone wyżej tylko rozprasza, więc do banera trafia wyłącznie to, czego
 * nie da się przypiąć do żadnego pola: zbiorcze `form` z API (np. blokada
 * konta) albo — gdy nie ma ani jego, ani żadnego naruszenia — sam komunikat
 * koperty (np. `api_unreachable`, czyli zgaszone API).
 */
function komunikatOgolny(
  blad: ApiErrorBody | undefined,
  pola: Record<string, string | undefined>,
): string | undefined {
  if (blad === undefined) {
    return undefined;
  }

  if (pola.form !== undefined) {
    return pola.form;
  }

  return POLA_FORMULARZA.some((pole) => pola[pole] !== undefined)
    ? undefined
    : blad.error.message;
}
