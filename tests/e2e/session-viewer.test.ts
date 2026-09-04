import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";
import { MAX_SESSION_HTML_BYTES } from "../../src/gist.js";

const execFileAsync = promisify(execFile);
const DARK_GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";
const LIGHT_GIST_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const generatedDirectory = resolve("tests/.generated");
const generatedSession = resolve(generatedDirectory, "session.html");

async function createExportFixture(): Promise<string> {
  await mkdir(generatedDirectory, { recursive: true });
  await execFileAsync(resolve("node_modules/.bin/pi"), [
    "--export",
    resolve("tests/fixtures/session.jsonl"),
    generatedSession,
  ]);
  return readFile(generatedSession, "utf8");
}

function replaceSessionText(
  html: string,
  original: string,
  replacement: string,
): string {
  const match =
    /(<script id="session-data" type="application\/json">\s*)([^<]+)(\s*<\/script>)/i.exec(
      html,
    );
  if (!match) throw new Error("Pi export is missing session-data");

  const payload = JSON.parse(
    Buffer.from(match[2].trim(), "base64").toString("utf8"),
  ) as {
    entries: Array<{ message?: { content?: string } }>;
  };
  const firstMessage = payload.entries[0]?.message;
  const content = firstMessage?.content;
  if (!firstMessage || typeof content !== "string") {
    throw new Error("Fixture message is missing");
  }
  firstMessage.content = content.replace(original, replacement);

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return html.replace(match[0], `${match[1]}${encoded}${match[3]}`);
}

async function mockGist(page: Page, html: string): Promise<void> {
  await page.route("https://api.github.com/gists/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        files: {
          "session.html": {
            type: "text/html",
            size: Buffer.byteLength(html),
            truncated: false,
            content: html,
          },
        },
      }),
    });
  });
}

test("shows the built-in share configuration without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("PI_SHARE_VIEWER_URL", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Secret Gists are unlisted", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("loads a real Pi export and enhances Mermaid diagrams", async ({
  page,
}) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|ERR_BLOCKED_BY_CSP/i.test(message.text())) {
      cspErrors.push(message.text());
    }
  });

  const html = await createExportFixture();
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await expect(
    frame.getByText("A normal Markdown paragraph.", { exact: true }),
  ).toBeVisible();
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(1);
  await expect(frame.locator(".pi-mermaid-card svg")).toBeVisible();
  await expect(frame.locator(".pi-mermaid-error")).toContainText(
    "Unable to render Mermaid",
  );
  await expect(frame.locator("pre > code.hljs")).toHaveCount(2);
  await expect(
    frame.getByText("const ordinary = true;", { exact: true }),
  ).toBeVisible();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "dark",
  );

  const card = frame.locator(".pi-mermaid-card");
  await card.getByRole("button", { name: "Source" }).click();
  await expect(card.locator(".pi-mermaid-source")).toBeVisible();
  await expect(card.locator(".pi-mermaid-source")).toContainText(
    "Start[Start]",
  );
  await card.getByRole("button", { name: "Diagram" }).click();

  await card.getByRole("button", { name: "+" }).click();
  await expect(card.locator(".pi-mermaid-stage")).toHaveAttribute(
    "style",
    /scale\(1\.25\)/,
  );
  await card.getByRole("button", { name: "−" }).click();
  await expect(card.locator(".pi-mermaid-stage")).toHaveAttribute(
    "style",
    /scale\(1\)/,
  );
  await card.getByRole("button", { name: "Fit" }).click();

  const viewport = card.locator(".pi-mermaid-viewport");
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) throw new Error("Mermaid viewport is not visible");
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2 + 40,
    viewportBox.y + viewportBox.height / 2 + 20,
  );
  await page.mouse.up();
  expect(
    await card.locator(".pi-mermaid-stage").getAttribute("style"),
  ).not.toContain("translate(0px, 0px)");

  await card.getByRole("button", { name: "Reset" }).click();
  await expect(card.locator(".pi-mermaid-stage")).toHaveAttribute(
    "style",
    /translate\(0px, 0px\) scale\(1\)/,
  );

  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    const testWindow = window as Window & { copyFallbackUsed?: boolean };
    document.execCommand = () => {
      testWindow.copyFallbackUsed = true;
      return true;
    };
  });
  await card.getByRole("button", { name: "Copy" }).click();
  await expect(card.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(
    await frame
      .locator("body")
      .evaluate(() =>
        Boolean(
          (window as Window & { copyFallbackUsed?: boolean }).copyFallbackUsed,
        ),
      ),
  ).toBe(true);

  await card.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("denied"));
  });
  await card.getByRole("button", { name: "Fullscreen" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);

  await frame.locator("body").evaluate((body) => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs";
    code.textContent = "flowchart LR\n  Start[Start] --> Finish[Finish]";
    pre.append(code);
    body.append(pre);
  });
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(2);
  await frame
    .locator("body")
    .evaluate((body) => body.append(document.createElement("span")));
  await page.waitForTimeout(100);
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/desktop-dark.png",
    fullPage: true,
  });

  const iframe = page.locator("#preview");
  await expect(iframe).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-downloads",
  );
  await expect(iframe).toHaveAttribute("allow", "fullscreen");
  await expect(iframe).not.toHaveAttribute("sandbox", /allow-same-origin/);
  expect(cspErrors).toEqual([]);
});

test("renders safely at mobile and desktop sizes in dark and light sessions", async ({
  page,
}) => {
  const darkHtml = await createExportFixture();
  const lightHtml = darkHtml.replace(
    /<head(?:\s[^>]*)?>/i,
    "$&<style>html,body{background:#fff!important;color:#18181b!important}</style>",
  );
  await mockGist(page, lightHtml);

  for (const viewport of [
    { width: 390, height: 844, name: "mobile" },
    { width: 1440, height: 900, name: "desktop" },
    { width: 1920, height: 1080, name: "wide" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/session/#${LIGHT_GIST_ID}`);
    const frame = page.frameLocator("#preview");
    await expect(frame.locator(".pi-mermaid-card svg").first()).toBeVisible();
    await expect(frame.locator(".pi-mermaid-card")).toHaveCount(1);
    for (const control of [
      "−",
      "+",
      "Fit",
      "Reset",
      "Source",
      "Copy",
      "Fullscreen",
    ]) {
      await expect(
        frame.getByRole("button", { name: control, exact: true }),
      ).toBeVisible();
    }
    await expect(frame.locator("html")).toHaveAttribute(
      "data-pi-mermaid-theme",
      "light",
    );
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
    await page.screenshot({
      path: `test-results/${viewport.name}-light.png`,
      fullPage: true,
    });
  }
});

test("keeps a stale hash request from replacing the latest session", async ({
  page,
}) => {
  const firstHtml = await createExportFixture();
  const latestHtml = replaceSessionText(
    firstHtml,
    "A normal Markdown paragraph.",
    "The latest session wins.",
  );

  await page.route("https://api.github.com/gists/**", async (route) => {
    const isFirst = route.request().url().endsWith(DARK_GIST_ID);
    if (isFirst) await new Promise((resolve) => setTimeout(resolve, 500));
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          files: {
            "session.html": {
              type: "text/html",
              size: Buffer.byteLength(isFirst ? firstHtml : latestHtml),
              truncated: false,
              content: isFirst ? firstHtml : latestHtml,
            },
          },
        }),
      })
      .catch(() => undefined);
  });

  const firstRequest = page.waitForRequest(
    `https://api.github.com/gists/${DARK_GIST_ID}`,
  );
  await page.goto(`/session/#${DARK_GIST_ID}`);
  await firstRequest;
  await page.evaluate((gistId) => {
    window.location.hash = gistId;
  }, LIGHT_GIST_ID);

  const frame = page.frameLocator("#preview");
  await expect(
    frame.getByText("The latest session wins.", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  await expect(
    frame.getByText("A normal Markdown paragraph.", { exact: true }),
  ).toHaveCount(0);
});

test("rejects oversized content before it enters the iframe", async ({
  page,
}) => {
  await page.route("https://api.github.com/gists/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        files: {
          "session.html": {
            type: "text/html",
            size: MAX_SESSION_HTML_BYTES + 1,
            truncated: false,
            content: "small",
          },
        },
      }),
    });
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);

  await expect(page.locator("#error-message")).toContainText("too large");
  await expect(page.locator("#preview")).toBeHidden();
  await expect(page.locator("#preview")).not.toHaveAttribute("srcdoc", /.*/);
});

test("shows malformed remote data as text", async ({ page }) => {
  await page.route("https://api.github.com/gists/**", async (route) => {
    await route.fulfill({
      status: 404,
      body: '<img src=x onerror="alert(1)">',
    });
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  await expect(page.locator("#error-message")).toContainText(
    "Session not found",
  );
  await expect(page.locator("#error-message img")).toHaveCount(0);
});
