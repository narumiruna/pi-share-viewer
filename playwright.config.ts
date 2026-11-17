import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const isWSL =
  Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) ||
  (process.platform === "linux" &&
    /microsoft/i.test(readFileSync("/proc/sys/kernel/osrelease", "utf8")));

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chromium",
    launchOptions: { args: isWSL ? ["--ozone-platform=wayland"] : [] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
