import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { config as loadEnv } from "dotenv";

// The same rule as vitest.config.ts: dotenv does NOT override a variable that
// is already set, so CI's explicit DATABASE_URL wins over the file's, and
// .env.test is only a fallback for local runs. The Playwright web server
// starts `next dev` as a child process, and that process does not read this
// file - so the values are read here and put in the environment the child
// inherits.
loadEnv({ path: path.resolve(__dirname, ".env.test") });

const authFile = path.join(__dirname, "playwright/.auth/user.json");

// The address a browser profile presents to the application.
//
// The transitional route counts its failures against the client, and it takes
// the client's address from `x-forwarded-for` — the header a deployment behind
// a proxy fills in. Next.js fills a missing header from the socket's address
// and keeps one the caller supplied, so with no proxy in front every profile
// would share one budget. Each profile gets an address of its own instead, so
// the limiter is exercised the way a deployment exercises it: one budget per
// client.
const client = (octet: number) => ({
  extraHTTPHeaders: { "x-forwarded-for": `10.0.0.${octet}` },
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: client(1),
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: authFile, ...client(2) },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: authFile, ...client(3) },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], storageState: authFile, ...client(4) },
      dependencies: ["setup"],
    },
    {
      name: "iPhone 13",
      use: { ...devices["iPhone 13"], storageState: authFile, ...client(5) },
      dependencies: ["setup"],
      testIgnore: [
        // Logout spec exercises the auth-cleared redirect path; the iPhone
        // viewport adds no extra signal here.
        "**/logout.spec.ts",
      ],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
