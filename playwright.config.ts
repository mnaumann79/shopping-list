import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "playwright/.auth/user.json");

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
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: authFile },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], storageState: authFile },
      dependencies: ["setup"],
    },
    {
      name: "iPhone 13",
      use: { ...devices["iPhone 13"], storageState: authFile },
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
