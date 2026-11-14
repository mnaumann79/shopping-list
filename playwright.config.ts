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
  // In CI the report has to be read by somebody who is not at the console:
  // the `github` reporter annotates the pull request with the failures, and
  // the HTML report is written out for the artifact. The `open: "never"`
  // stops it from trying to open a browser on a runner.
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never" }],
      ]
    : "html",
  // The suite has to finish inside the CI job's budget.
  //
  // One worker does not fit: a browser project takes about eleven minutes
  // with one worker, there are four of them, and the job has forty-three
  // minutes for the suite. The workers are what make it fit, and they are
  // safe because the specs are independent — every one of them creates its
  // own users and its own household, and the stack is shared.
  //
  // The address of the client is still one per project, and the workers
  // share it. The transitional sign-in counts a client's failures, and the
  // budget is ten failures in fifteen minutes; the suite makes two failed
  // sign-ins a project, so a project fits under it.
  workers: 4,
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
