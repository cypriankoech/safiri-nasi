import { defineConfig } from "@playwright/test";

// End-to-end tests run against the dev stack (API with PAYMENTS_MODE=mock + `npm run dev`).
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
  },
});
