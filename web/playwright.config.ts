import { defineConfig, devices } from "@playwright/test";

// E2E tests expect a database seeded with demo data (`python etl/cli.py seed --reset`).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false, // tests share one database (notes are created and removed)
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 60_000 },
});
