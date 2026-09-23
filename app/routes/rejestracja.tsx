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
    <main className="flex min-h-screen items-center justify-center bg-tg-tlo p-6">
      {/*
        Ten sam panel co w `logowanie.tsx`, klasa w klasę. Wcześniej te dwa
        ekrany nie miały ze sobą nic wspólnego — jeden stał na gradiencie ze
        szkłem, drugi na gołym `max-w-md p-8` — i użytkownik przechodzący
        z jednego na drugi widział dwa różne produkty. Jeśli zmieniasz panel
        tutaj, zmień go tam; jeśli robisz to po raz trzeci, to jest sygnał, żeby
        wyciągnąć go do wspólnego komponentu w `app/components/`.
      */}
      <div className="w-full max-w-md rounded-xs border border-tg-linia bg-tg-panel p-8">
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
                daje 30 px. Rozjazd wysokości między tymi dwoma ekranami jest
                dokładnie tą niespójnością, którą ta faza usuwa. */}
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
                autoComplete="username"
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

            <AntForm.Item
              label="Kod rejestracyjny"
              name="registrationCode"
              rules={[{ required: true }]}
              validateStatus={
                pola.registrationCode === undefined ? undefined : "error"
              }
              help={pola.registrationCode}
            >
              <Input
                name="registrationCode"
                autoComplete="off"
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
                Załóż konto
              </Button>
            </AntForm.Item>
          </AntForm>
        </RouterForm>

        <Typography.Paragraph className="mt-8 mb-0 text-center text-tg-tekst-drugorzedny">
          Masz już konto?{" "}
          <Link
            to="/logowanie"
            className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
          >
            Zaloguj się
          </Link>
        </Typography.Paragraph>
      </div>
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
