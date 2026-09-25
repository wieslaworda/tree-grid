import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, normalizePath } from "vite";

const katalogProjektu = normalizePath(fileURLToPath(new URL(".", import.meta.url))).replace(/\/$/, "");

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Serwer deweloperski serwuje pliki spod katalogu projektu każdemu, kto do
    // niego dotrze — bez bramy z chronione.tsx. Domyślne `allow` to cały
    // katalog projektu, więc przez tunel deweloperski dało się pobrać bazę
    // src/Api/db/*.db razem z hashami haseł (TG-SEC-01,
    // context/changes/owasp-security/raport.md).
    //
    // `allow` to allowlista: przeglądarka potrzebuje wyłącznie źródeł widoku
    // i zależności. `public/` obsługuje osobny middleware, a klienta Vite
    // (`/@vite/client`) Vite dopisuje sam. Nowy katalog, z którego widok
    // importuje moduły, trzeba tu dopisać — inaczej dostanie 403.
    //
    // `deny` wygrywa z `allow` i jest drugą linią obrony na wypadek
    // poszerzenia `allow`. Własna lista ZASTĘPUJE domyślną Vite, dlatego
    // pierwsze wpisy to przepisane wartości domyślne (Vite 8.3.0,
    // `_serverConfigDefaults.fs.deny`). Katalogi są zakotwiczone w katalogu
    // projektu: sam `**/src/**` pasowałby też do `node_modules/<pakiet>/src`.
    fs: {
      strict: true,
      allow: ["app", "node_modules"],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "*.db",
        "*.db-*",
        "*.sqlite",
        "*.sqlite-*",
        ...["src", "tests", "context", ".claude", ".tunnel-run", ".config", "build"].map(
          (katalog) => `${katalogProjektu}/${katalog}/**`,
        ),
      ],
    },
  },
});
