import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// The integration suite runs against a live database — the Supabase local
// stack in CI. It is deliberately NOT part of `pnpm test`: the unit suite has
// to stay runnable without a database, and a test that needs one belongs in
// its own run.
//
// OWNER_DATABASE_URL seeds and verifies; DATABASE_URL is the application's
// own connection, the non-owner role the policies apply to.
//
// NOT COMMITTED YET — see the note in tests/integration/rls-cross-household.test.ts.

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    // A test that hangs on a database is worse than a test that fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One database, one set of fixtures: the suites share it.
    fileParallelism: false,
  },
});
