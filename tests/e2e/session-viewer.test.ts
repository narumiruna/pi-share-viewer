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
  await expect(
    frame.locator(".pi-mermaid-card svg.pi-mermaid-polished"),
  ).toBeVisible();
  const polishedCard = frame.locator(".pi-mermaid-card");
  await expect(polishedCard).toHaveAttribute(
    "data-pi-mermaid-kind",
    "flowchart",
  );
  await expect(polishedCard.locator("svg.pi-mermaid-polished")).toBeVisible();
  await expect(polishedCard.getByRole("toolbar")).toHaveAttribute(
    "aria-label",
    "Diagram controls",
  );
  await expect(polishedCard.locator("g[data-pi-tone]")).toHaveCount(2);
  await expect(polishedCard.locator("[data-pi-edge=true]")).toHaveCount(1);
  await expect(
    polishedCard.getByText("flowchart", { exact: true }),
  ).toBeVisible();
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
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-session-ui",
    "radix",
  );

  const card = frame.locator(".pi-mermaid-card");
  const zoomInButton = card.getByRole("button", { name: "Zoom in" });
  await zoomInButton.hover();
  await expect(frame.getByRole("tooltip")).toHaveText("Zoom in");

  const traceButton = card.getByRole("button", { name: "Trace edges" });
  await expect(traceButton).toHaveAttribute("aria-pressed", "false");
  await traceButton.click();
  await expect(traceButton).toHaveAttribute("aria-pressed", "true");
  await expect(card).toHaveClass(/pi-mermaid-tracing/);
  await traceButton.click();
  await expect(traceButton).toHaveAttribute("aria-pressed", "false");

  await card.getByRole("button", { name: "Show source" }).click();
  await expect(card.locator(".pi-mermaid-source")).toBeVisible();
  await expect(card.locator(".pi-mermaid-source")).toContainText(
    "Start[Start]",
  );
  await card.getByRole("button", { name: "Show diagram" }).click();

  const stage = card.locator(".pi-mermaid-stage");
  await card.getByRole("button", { name: "Zoom in" }).click();
  await expect(stage).toHaveAttribute("style", /width: 125%/);
  expect(await stage.getAttribute("style")).not.toContain("scale(");
  await card.getByRole("button", { name: "Zoom out" }).click();
  await expect(stage).toHaveAttribute("style", /width: 100%/);
  await card.getByRole("button", { name: "Fit diagram" }).click();

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
  expect(await stage.getAttribute("style")).not.toContain(
    "translate(0px, 0px)",
  );

  await card.getByRole("button", { name: "Reset view" }).click();
  await expect(stage).toHaveAttribute("style", /translate\(0px, 0px\)/);
  await expect(stage).toHaveAttribute("style", /width: 100%/);

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
  await card.getByRole("button", { name: "Copy source" }).click();
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
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    element.requestFullscreen = async () => {
      fullscreenElement = element;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    (
      window as Window & { simulateBrowserFullscreenExit?: () => void }
    ).simulateBrowserFullscreenExit = () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });
  await card.getByRole("button", { name: "Open fullscreen" }).click();
  await expect(
    card.getByRole("button", { name: "Close fullscreen" }),
  ).toBeVisible();
  await frame.locator("body").evaluate(() => {
    (
      window as Window & { simulateBrowserFullscreenExit?: () => void }
    ).simulateBrowserFullscreenExit?.();
  });
  await expect(
    card.getByRole("button", { name: "Open fullscreen" }),
  ).toBeVisible();

  await card.evaluate((element) => {
    element.requestFullscreen = () => Promise.reject(new Error("denied"));
  });
  await card.getByRole("button", { name: "Open fullscreen" }).click();
  await expect(card).toHaveClass(/pi-mermaid-expanded/);
  await card.getByRole("button", { name: "Close fullscreen" }).click();
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);

  await frame.locator("body").evaluate((body) => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "hljs";
    code.textContent = "flowchart LR\n  Start[Start] --> Finish[Finish]";
    pre.append(code);
    body.append(pre);
  });
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(1);
  await expect(frame.locator("body > pre > code")).toContainText(
    "Start[Start]",
  );
  await frame
    .locator("body")
    .evaluate((body) => body.append(document.createElement("span")));
  await page.waitForTimeout(100);
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/desktop-dark.png",
    fullPage: true,
  });

  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "light",
  );
  await expect(
    frame.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("pi-share-viewer-theme")),
    )
    .toBe("light");

  const iframe = page.locator("#preview");
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("allow", "fullscreen");
  await expect(iframe).not.toHaveAttribute("sandbox", /allow-same-origin/);
  expect(cspErrors).toEqual([]);
});

test("preserves fence identity and supports Markdown containers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sourceHtml = await createExportFixture();
  const html = replaceSessionText(
    sourceHtml,
    "A normal Markdown paragraph.",
    `| Wide column |
| --- |
| ThisUnbreakableTableCellMustRemainReachableAcrossTheEntireNarrowMobileViewportWithoutBeingClipped |

An ordinary quote of the same diagram must remain code.

\`\`\`text
flowchart LR
  Start[Start] --> Finish[Finish]
\`\`\`

> \`\`\`mermaid
> flowchart LR
>   Quoted --> Diagram
> \`\`\`

- \`\`\`mermaid
  stateDiagram-v2
    [*] --> Listed
  \`\`\``,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(3);
  await expect(
    frame
      .locator(
        '.markdown-content pre:not(.pi-mermaid-source) > code[data-pi-mermaid-state="ordinary"]',
      )
      .filter({ hasText: "Start[Start]" }),
  ).toHaveCount(1);
  await expect(frame.locator('[data-pi-mermaid-kind="flowchart"]')).toHaveCount(
    2,
  );
  await expect(frame.locator('[data-pi-mermaid-kind="state"]')).toHaveCount(1);

  const table = frame.locator(".markdown-content table");
  await expect(table).toBeVisible();
  const tableOverflow = await table.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tableOverflow.scrollWidth).toBeGreaterThan(tableOverflow.clientWidth);
  expect(
    await table.evaluate((element) => {
      element.scrollLeft = 40;
      return element.scrollLeft > 0;
    }),
  ).toBe(true);
});

test("terminates an isolated renderer when its deadline expires", async ({
  page,
}) => {
  test.setTimeout(15_000);
  const html = await createExportFixture();
  await mockGist(page, html);
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.addEventListener("message", (event) => {
        const request = event.data;
        if (request.source.includes("Broken")) {
          window.parent.postMessage({
            type: "pi-mermaid-render-result",
            requestId: request.requestId,
            error: "Synthetic invalid diagram.",
          }, "*");
          return;
        }
        const end = performance.now() + 30_000;
        while (performance.now() < end) {}
      });`,
    });
  });

  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-mermaid-error").first()).toContainText(
    "rendering timed out",
    { timeout: 8_000 },
  );
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(0);
  await expect(
    frame.getByText("A normal Markdown paragraph.", { exact: true }),
  ).toBeVisible();
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
    await expect(
      frame.locator(".pi-mermaid-card svg.pi-mermaid-polished"),
    ).toBeVisible();
    await expect(frame.locator(".pi-mermaid-card")).toHaveCount(1);
    for (const control of [
      "Zoom out",
      "Zoom in",
      "Fit diagram",
      "Reset view",
      "Trace edges",
      "Show source",
      "Copy source",
      "Open fullscreen",
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
    const sessionHasOverflow = await frame
      .locator("html")
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(hasOverflow).toBe(false);
    expect(sessionHasOverflow).toBe(false);
    await page.screenshot({
      path: `test-results/${viewport.name}-light.png`,
      fullPage: true,
    });
  }
});

test("polishes flowchart, sequence, and state diagrams in the browser", async ({
  page,
}) => {
  const sourceHtml = await createExportFixture();
  const html = replaceSessionText(
    sourceHtml,
    "A normal Markdown paragraph.",
    `A normal Markdown paragraph.

\`\`\`mermaid
sequenceDiagram
  Browser->>API: Request
  API-->>Browser: Response
\`\`\`

\`\`\`mermaid
stateDiagram-v2
  [*] --> Ready
  Ready --> Done: run
  Done --> [*]
\`\`\``,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(3);
  for (const kind of ["flowchart", "sequence", "state"]) {
    const card = frame.locator(`[data-pi-mermaid-kind="${kind}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator("svg.pi-mermaid-polished")).toBeVisible();
    expect(await card.locator("[data-pi-tone]").count()).toBeGreaterThan(0);
    expect(await card.locator("[data-pi-edge=true]").count()).toBeGreaterThan(
      0,
    );
    const viewportBox = await card
      .locator(".pi-mermaid-viewport")
      .boundingBox();
    const svgBox = await card.locator("svg.pi-mermaid-polished").boundingBox();
    if (!viewportBox || !svgBox) throw new Error(`${kind} is not visible`);
    expect(svgBox.width).toBeLessThanOrEqual(viewportBox.width);
    expect(svgBox.height).toBeLessThanOrEqual(viewportBox.height);
    await card.screenshot({ path: `test-results/${kind}-dark.png` });
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
