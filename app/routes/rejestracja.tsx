import { Alert, Button, Form as AntForm, Input, Typography } from "antd";
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
  AUTH_REGISTER_PATH,
  HOME_ROUTE,
  createUserSession,
  getUser,
  requestAccount,
  requireSameOrigin,
} from "~/lib/auth.server";

import type { Route } from "./+types/rejestracja";

/** Patrz `logowanie.tsx` — ta sama rola, o jedno pole dłuższa lista. */
const POLA_FORMULARZA = ["email", "password", "registrationCode"] as const;

export function meta() {
  return [{ title: "Rejestracja — TreeGrid" }];
}

/**
 * Rejestracja stoi poza bramą z tego samego powodu co logowanie: przed
 * założeniem konta nie ma sesji, którą można by sprawdzić. Bramką jest tu kod
 * rejestracyjny weryfikowany przez API — `trycloudflare.com` nie obsługuje
 * Cloudflare Access (`infrastructure.md:222`), więc przed tym formularzem nie
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
  const result = await requestAccount(AUTH_REGISTER_PATH, {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    registrationCode: String(formData.get("registrationCode") ?? ""),
  });

  if (!result.ok) {
    return data(result.error, { status: result.status });
  }

  // Sesja zakładana od razu po rejestracji. Odesłanie na formularz logowania
  // wymagałoby przeniesienia przez przekierowanie informacji „konto powstało",
  // bo bez niej użytkownik nie odróżnia sukcesu od nic-nierobienia — a to
  // więcej stanu niż wystawienie ciasteczka komuś, kto przed chwilą podał
  // poprawny kod rejestracyjny.
  return createUserSession(result.user, HOME_ROUTE);
}

/**
 * Budowa formularza — dwa komponenty `Form` o rozłącznych rolach, podział
 * walidacji na natywną i antd, jawne `name` na polach — jest opisana
 * w `logowanie.tsx`. Tutaj dochodzi jedno pole: kod rejestracyjny.
 *
 * Kod świadomie nie ma w przeglądarce żadnej reguły poza „niepusty". Jego
 * format jest sekretem konfiguracji (`Auth:RegistrationCode`), a wzorzec
 * sprawdzany po stronie klienta rozgłaszałby, jak ten sekret wygląda — komu
 * pasuje kod, rozstrzyga wyłącznie API.
 */
export default function Rejestracja() {
  const blad = useActionData<ApiErrorBody>();
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  const nawigacja = useNavigation();
  const wysylanie = nawigacja.state !== "idle";

  return (
    <main className="mx-auto max-w-md p-8">
      <Typography.Title level={1}>Rejestracja</Typography.Title>

      {ogolny === undefined ? null : (
        <Alert className="mb-6" type="error" showIcon message={ogolny} />
      )}

      <RouterForm method="post">
        <AntForm component={false} layout="vertical">
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
            <Input name="email" type="email" autoComplete="username" required />
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
              required
            />
          </AntForm.Item>

          <AntForm.Item
            label="Kod rejestracyjny"
            name="registrationCode"
            rules={[{ required: true }]}
            validateStatus={
              pola.registrationCode === undefined ? undefined : "error"
            }
            help={pola.registrationCode}
          >
            <Input name="registrationCode" autoComplete="off" required />
          </AntForm.Item>

          <AntForm.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={wysylanie}
              disabled={wysylanie}
            >
              Załóż konto
            </Button>
          </AntForm.Item>
        </AntForm>
      </RouterForm>

      <Typography.Paragraph>
        Masz już konto? <Link to="/logowanie">Zaloguj się</Link>
      </Typography.Paragraph>
    </main>
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

/** Patrz `logowanie.tsx` — ten sam wybór treści banera. */
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
