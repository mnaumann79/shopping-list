import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadEnv } from "dotenv";
import path from "path";

// The suites need DATABASE_URL whether they run locally or in CI, and the
// two get it from different places: CI sets it as an environment variable, a
// developer has a .env.test file. (TEST_EMAIL and TEST_PASSWORD belong to
// the Playwright setup, not to Vitest - e2e/auth.setup.ts is what reads
// them.)
//
// dotenv does NOT override a variable that is already set, so this file is a
// fallback, not an override: CI's DATABASE_URL wins over the file's, which is
// what keeps the CI service container authoritative. Locally, where nothing is
// set, the file supplies the values.
//
// Only the test runner reads this file. It is not loaded by `next build` or
// `next dev`, so it cannot leak into a production build.
loadEnv({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["node_modules", "e2e", ".next"],
  },
});
