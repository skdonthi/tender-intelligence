import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Server-only Node libs used only inside server functions (DB + LLM/PDF clients).
const SERVER_ONLY = [
  "pdf-parse",
  "pg",
  "openai",
  "cohere-ai",
  "@anthropic-ai/sdk",
  "@google-cloud/vertexai",
];

export default defineConfig(({ mode }) => {
  // `vite dev` / `node` don't auto-load .env into process.env the way the old
  // Vinxi/nitro stack did. Load every key (prefix "") so server functions see
  // DATABASE_URL / ANTHROPIC_API_KEY / OPENAI_API_KEY etc. during dev + build.
  // (Production `npm start` uses node --env-file-if-exists; Vercel injects env.)
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [tanstackStart({ srcDirectory: "app" }), viteReact()],
    // Keep server-only libs out of the client dep-optimizer (their vendored CJS
    // does require('http') etc.) and external in the SSR bundle.
    optimizeDeps: { exclude: SERVER_ONLY },
    ssr: { external: SERVER_ONLY },
    build: {
      rollupOptions: {
        // Silence cosmetic UNUSED_EXTERNAL_IMPORT warnings from TanStack's own
        // bundles. Scoped to @tanstack so our own code's warnings still surface.
        onwarn(warning, defaultHandler) {
          if (
            warning.code === "UNUSED_EXTERNAL_IMPORT" &&
            /@tanstack\//.test(warning.message ?? "")
          ) {
            return;
          }
          defaultHandler(warning);
        },
      },
    },
  };
});
