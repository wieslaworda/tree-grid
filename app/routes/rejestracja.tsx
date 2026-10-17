import { Alert, Button, Form as AntForm, Input, Typography } from "antd";
import {
  Form as RouterForm,
  Link,
  data,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";

import { PanelUwierzytelniania } from "~/components/PanelUwierzytelniania";
import type { ApiErrorBody } from "~/lib/api.server";
import {
  HOME_ROUTE,
  REGISTER_CONFIRM_ROUTE,
  getUser,
  requestRegistration,
  requireSameOrigin,
} from "~/lib/auth.server";

import type { Route } from "./+types/rejestracja";

/** Patrz `logowanie.tsx` — ta sama rola, o jedno pole dłuższa lista. */
const POLA_FORMULARZA = ["login", "email", "password"] as const;

export function meta() {
  return [{ title: "Rejestracja — TreeGrid" }];
}

/**
 * Krok 1 rejestracji. Stoi poza bramą z tego samego powodu co logowanie: przed
 * założeniem konta nie ma sesji, którą można by sprawdzić.
 *
 * Ten formularz konta nie zakłada. API zapisuje oczekującą rejestrację
 * i wysyła jednorazowy kod weryfikacyjny na adres e-mail podany w formularzu,
 * a konto powstaje dopiero w kroku 2 (`routes/rejestracja-potwierdzenie.tsx`),
 * gdy osoba wpisze ten kod. Kod potwierdza wyłącznie dostęp do skrzynki, a nie
 * czyjąkolwiek zgodę (PRD `Access Control`, 2026-10-17): konto założy każdy,
 * kto ma adres e-mail i zna adres aplikacji — `trycloudflare.com` nie obsługuje
 * Cloudflare Access (`infrastructure.md:221`), więc przed tym formularzem nie
 * stoi nic innego.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if ((await getUser(request)) !== null) {
    throw redirect(HOME_ROUTE);
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);

  const formData = await request.formData();

  // Nazwy pól są wspólnym kontraktem z `AuthFormFields`
  // (`src/Api/Auth/AuthEndpoints.cs`) — patrz komentarz w `logowanie.tsx`.
  const result = await requestRegistration({
    login: String(formData.get("login") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) {
    // Także `rate_limited` (429) i `mail_unavailable` (503): oba mają pusty
    // `context`, więc trafiają do banera komunikatem koperty z API.
    return data(result.error, { status: result.status });
  }

  // Login w adresie, a nie w sesji ani w ciasteczku: rejestrację wskazuje
  // zarezerwowany login, więc krok 2 da się otworzyć także później (w ciągu
  // 30 minut ważności kodu) i z innego urządzenia — tego, na którym rejestrujący
  // odczytał wiadomość. Login z odpowiedzi API, bo to on (po przycięciu) jest
  // kluczem rejestracji.
  return redirect(
    `${REGISTER_CONFIRM_ROUTE}?login=${encodeURIComponent(result.login)}`,
  );
}

/**
 * Budowa formularza — dwa komponenty `Form` o rozłącznych rolach, podział
 * walidacji na natywną i antd, jawne `name` na polach — jest opisana
 * w `logowanie.tsx`. Tutaj dochodzą pola, z których API składa wniosek o konto:
 * login (przyszły identyfikator logowania) i adres e-mail (dana konta, a zarazem
 * adres, na który API wysyła kod weryfikacyjny).
 */
export default function Rejestracja() {
  const blad = useActionData<ApiErrorBody>();
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  const nawigacja = useNavigation();
  const wysylanie = nawigacja.state !== "idle";

  return (
    // Panel wspólny z logowaniem i krokiem 2 —
    // `app/components/PanelUwierzytelniania.tsx`.
    <PanelUwierzytelniania>
      {/* `Typography.Title`, a nie `<h1>` jak w logowaniu, i to zostaje:
          dzięki temu ścieżka SSR przez antd (CLAUDE.md, kontrakty 1 i 2)
          jest ćwiczona także na tym ekranie. */}
      <Typography.Title level={1} className="text-center">
        Rejestracja
      </Typography.Title>

      {ogolny === undefined ? null : (
        <Alert className="mb-6" type="error" showIcon message={ogolny} />
      )}

      <RouterForm method="post">
        <AntForm component={false} layout="vertical">
          {/* `size="large"` na polach i na CTA jest tym samym wyborem co
              w logowaniu i z tego samego powodu — przy `controlHeight: 24`
              daje 30 px. Rozjazd wysokości między ekranami uwierzytelniania
              jest dokładnie tą niespójnością, której wspólny panel ma
              zapobiegać. */}
          <AntForm.Item
            label="Login"
            name="login"
            // Wyłącznie „niepusty”: długość i dozwolone znaki loginu sprawdza
            // API (`RegistrationRules`) i stamtąd przychodzi komunikat.
            rules={[{ required: true }]}
            validateStatus={pola.login === undefined ? undefined : "error"}
            help={pola.login}
          >
            <Input
              name="login"
              autoComplete="username"
              size="large"
              required
            />
          </AntForm.Item>

          <AntForm.Item
            label="Adres e-mail"
            name="email"
            rules={[
              { required: true },
              { type: "email", message: "Podaj poprawny adres e-mail." },
            ]}
            validateStatus={pola.email === undefined ? undefined : "error"}
            help={pola.email}
          >
            <Input
              name="email"
              type="email"
              autoComplete="email"
              size="large"
              required
            />
          </AntForm.Item>

          <AntForm.Item
            label="Hasło"
            name="password"
            // Żadnej reguły długości ani złożoności: te ustawia Identity po
            // stronie API i stamtąd przychodzą ich komunikaty. Powtórzenie ich
            // tutaj dawałoby dwa źródła prawdy, z których jedno cicho starzeje
            // się przy każdej zmianie konfiguracji hasła.
            rules={[{ required: true }]}
            validateStatus={pola.password === undefined ? undefined : "error"}
            help={pola.password}
          >
            <Input.Password
              name="password"
              autoComplete="new-password"
              size="large"
              required
            />
          </AntForm.Item>

          <AntForm.Item className="mt-8 mb-0">
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={wysylanie}
              disabled={wysylanie}
            >
              Wyślij wniosek o konto
            </Button>
          </AntForm.Item>
        </AntForm>
      </RouterForm>

      <Typography.Paragraph className="mt-8 mb-0 text-center text-tg-tekst-drugorzedny">
        Masz już kod weryfikacyjny?{" "}
        <Link
          to="/rejestracja/potwierdzenie"
          className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
        >
          Potwierdź rejestrację
        </Link>
      </Typography.Paragraph>

      <Typography.Paragraph className="mt-2 mb-0 text-center text-tg-tekst-drugorzedny">
        Masz już konto?{" "}
        <Link
          to="/logowanie"
          className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
        >
          Zaloguj się
        </Link>
      </Typography.Paragraph>
    </PanelUwierzytelniania>
  );
}

/** Patrz `logowanie.tsx` — ten sam odczyt naruszeń pól z `context`. */
function naruszeniaPol(
  blad: ApiErrorBody | undefined,
): Record<string, string | undefined> {
  const fields = blad?.error.context.fields;

  return typeof fields === "object" && fields !== null
    ? (fields as Record<string, string>)
    : {};
}

/**
 * Patrz `logowanie.tsx` — ten sam wybór treści banera. Odmowy bez pól
 * (`rate_limited`, `mail_unavailable`, `api_unreachable`) wychodzą komunikatem
 * koperty.
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
