import { defineConfig, devices } from "@playwright/test";

// Uses the Edge already on the machine, so no browser download. Point E2E_URL at the running site.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  reporter: "line",
  use: { baseURL: process.env.E2E_URL ?? "http://127.0.0.1:8000", channel: "msedge" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true } },
  ],
});
