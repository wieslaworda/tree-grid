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
  AUTH_REGISTER_CONFIRM_PATH,
  HOME_ROUTE,
  createUserSession,
  getUser,
  requestAccount,
  requireSameOrigin,
} from "~/lib/auth.server";

import type { Route } from "./+types/rejestracja-potwierdzenie";

/** Patrz `logowanie.tsx` — ta sama rola listy pól. */
const POLA_FORMULARZA = ["login", "code"] as const;

export function meta() {
  return [{ title: "Potwierdzenie rejestracji — TreeGrid" }];
}

/**
 * Krok 2 rejestracji: login i kod weryfikacyjny, który administrator dostał
 * pocztą i przekazał osobie, której wniosek akceptuje. Poprawny kod zakłada
 * konto i sesję. Trasa stoi poza bramą (`app/routes.ts`) z tego samego powodu
 * co logowanie i krok 1 — konta jeszcze nie ma.
 *
 * Login przychodzi w `?login=` z przekierowania po kroku 1, ale pole jest
 * edytowalne: kod może przyjść po kilku godzinach, a osoba może otworzyć ten
 * ekran z innego urządzenia albo z linku w kroku 1 — rejestrację wskazuje
 * zarezerwowany login, nie stan przeglądarki.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if ((await getUser(request)) !== null) {
    throw redirect(HOME_ROUTE);
  }

  return { login: new URL(request.url).searchParams.get("login") ?? "" };
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request);

  const formData = await request.formData();

  // Nazwy pól są wspólnym kontraktem z `AuthFormFields`
  // (`src/Api/Auth/AuthEndpoints.cs`) — patrz komentarz w `logowanie.tsx`.
  // Kod weryfikacyjny nie trafia do żadnego logu: `requestAccount` nie loguje
  // treści żądania.
  const result = await requestAccount(AUTH_REGISTER_CONFIRM_PATH, {
    login: String(formData.get("login") ?? ""),
    code: String(formData.get("code") ?? ""),
  });

  if (!result.ok) {
    return data(result.error, { status: result.status });
  }

  // Sesja od razu po założeniu konta — tak jak dotąd po rejestracji. Kto podał
  // poprawny kod od administratora, właśnie przeszedł bramkę rejestracji, a
  // odesłanie na logowanie wymagałoby przenoszenia informacji „konto powstało”
  // przez przekierowanie.
  return createUserSession(result.user, HOME_ROUTE);
}

/**
 * Budowa formularza jest opisana w `logowanie.tsx`. Tu dochodzą dwie rzeczy.
 *
 * Login jest wypełniony z adresu przez `initialValues`, a nie `defaultValue`:
 * `Form.Item` z `name` steruje wartością pola ze stanu formularza antd, więc
 * `defaultValue` na samym `Input` zostałby zignorowany.
 *
 * Kod ma w przeglądarce wyłącznie regułę „niepusty”. Kształt kodu (ile cyfr)
 * zna API i tylko ono rozstrzyga, który kod pasuje — wzorzec po stronie klienta
 * byłby drugim źródłem prawdy. `inputMode="numeric"` daje klawiaturę numeryczną
 * na telefonie, a `autoComplete="one-time-code"` mówi przeglądarce, że to
 * jednorazowy kod, a nie hasło do zapamiętania.
 */
export default function RejestracjaPotwierdzenie({
  loaderData,
}: Route.ComponentProps) {
  const blad = useActionData<ApiErrorBody>();
  const pola = naruszeniaPol(blad);
  const ogolny = komunikatOgolny(blad, pola);

  const nawigacja = useNavigation();
  const wysylanie = nawigacja.state !== "idle";

  return (
    // Panel wspólny z logowaniem i krokiem 1 —
    // `app/components/PanelUwierzytelniania.tsx`.
    <PanelUwierzytelniania>
      <Typography.Title level={1} className="text-center">
        Potwierdzenie rejestracji
      </Typography.Title>

      <Typography.Paragraph className="mb-8 text-center text-tg-tekst-drugorzedny">
        Kod weryfikacyjny wysłaliśmy administratorowi — poproś go o przekazanie
        kodu.
      </Typography.Paragraph>

      {ogolny === undefined ? null : (
        <Alert
          className="mb-6"
          type="error"
          showIcon
          message={ogolny.komunikat}
          // `fields.form` znaczy tu zawsze to samo: tej rejestracji nie da się
          // już dokończyć (wygasła, nie istnieje, wyczerpała próby albo login
          // zajęło w międzyczasie inne konto). Jedyną drogą jest ponowny krok 1.
          description={
            ogolny.ponownaRejestracja ? (
              <Link
                to="/rejestracja"
                className="font-semibold text-tg-akcent underline-offset-4 hover:underline"
              >
                Wypełnij formularz rejestracji
              </Link>
            ) : undefined
          }
        />
      )}

      <RouterForm method="post">
        <AntForm
          component={false}
          layout="vertical"
          initialValues={{ login: loaderData.login }}
        >
          <AntForm.Item
            label="Login"
            name="login"
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
            label="Kod weryfikacyjny"
            name="code"
            rules={[{ required: true }]}
            validateStatus={pola.code === undefined ? undefined : "error"}
            help={pola.code}
          >
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
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
 * Patrz `logowanie.tsx` — ten sam wybór treści banera, z jedną różnicą:
 * zbiorcze `form` niesie tu dodatkowo link do kroku 1, bo po takiej odmowie
 * nie ma czego poprawiać w tym formularzu.
 */
function komunikatOgolny(
  blad: ApiErrorBody | undefined,
  pola: Record<string, string | undefined>,
): { komunikat: string; ponownaRejestracja: boolean } | undefined {
  if (blad === undefined) {
    return undefined;
  }

  if (pola.form !== undefined) {
    return { komunikat: pola.form, ponownaRejestracja: true };
  }

  return POLA_FORMULARZA.some((pole) => pola[pole] !== undefined)
    ? undefined
    : { komunikat: blad.error.message, ponownaRejestracja: false };
}
