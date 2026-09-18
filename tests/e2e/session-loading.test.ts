import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  LIGHT_GIST_ID,
  mockGist,
  replaceSessionText,
} from "./session-fixture.js";

test("renders base text while optional assets are held, then enhances in place", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const html = await createReviewExportFixture();
  await mockGist(page, html);
  let releaseEnhancer: (() => void) | undefined;
  let releaseRenderer: (() => void) | undefined;
  const enhancerGate = new Promise<void>((resolve) => {
    releaseEnhancer = resolve;
  });
  const rendererGate = new Promise<void>((resolve) => {
    releaseRenderer = resolve;
  });
  await page.route("**/assets/mermaid-enhancer.js", async (route) => {
    await enhancerGate;
    await route.fallback();
  });
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    await rendererGate;
    await route.fallback();
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(
    frame
      .locator("#entry-22222222")
      .getByText(/base conversation is readable before optional rendering/i),
  ).toBeVisible();
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(0);
  await expect(frame.locator(".pi-math").first()).toContainText("$x_i$");
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(0);
  await expect(page.locator("#enhancement-status")).toBeVisible();
  await expect(page.locator("#enhancement-message")).toContainText(
    "Text is ready",
  );
  await frame.locator("body").evaluate((body) => {
    body.dataset.baseNodeIdentity = "preserve-me";
  });
  await frame
    .getByRole("button", { name: "Toggle thinking", exact: true })
    .click();

  releaseEnhancer?.();
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
  await expect(
    frame.locator('.pi-math[data-pi-math-state="error"]'),
  ).toHaveCount(1);
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(2);
  releaseRenderer?.();
  for (const index of [1, 2]) {
    const card = frame.locator(`[id="11111111-diagram-${index}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
      timeout: 30_000,
    });
  }
  await expect(frame.locator("body")).toHaveAttribute(
    "data-base-node-identity",
    "preserve-me",
  );
  await expect(frame.locator("#entry-22222222 .thinking-text")).toBeHidden();
  await expect(frame.locator(".pi-mermaid-card")).toHaveCount(2);
  await expect(page.locator("#enhancement-status")).toBeHidden();
});

test("shows raw session download progress in the loading status", async ({
  page,
}) => {
  const html = await createReviewExportFixture();
  const rawUrl = `https://gist.githubusercontent.com/owner/${DARK_GIST_ID}/raw/rev/session.html`;
  await page.route("https://api.github.com/gists/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        files: {
          "session.html": {
            type: "text/html",
            size: Buffer.byteLength(html),
            truncated: true,
            raw_url: rawUrl,
          },
        },
      }),
    }),
  );
  await page.route(rawUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: html,
    }),
  );

  await page.goto(`/session/#${DARK_GIST_ID}`);
  await expect(
    page.frameLocator("#preview").locator("#entry-11111111"),
  ).toBeVisible();
  await expect(page.locator("#loading-message")).toHaveText(
    "Downloading Pi session… 100%",
  );
});

test("renderer failure leaves math readable and retry preserves viewer state", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await mockGist(page, await createReviewExportFixture());
  let failRenderer = true;
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    if (failRenderer) {
      await route.fulfill({ status: 503, body: "renderer unavailable" });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
  await expect(page.locator("#enhancement-message")).toContainText(
    "Diagrams unavailable; math remains available",
  );
  const card = frame.locator('[id="11111111-diagram-1"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute(
    "data-pi-mermaid-state",
    "waiting-runtime",
  );
  await expect(card.locator(".pi-mermaid-source")).toBeVisible();
  const alternate = frame.locator('.tree-node[data-id="aaaabbbb"]');
  await alternate.click();
  await expect(frame.locator("#entry-aaaabbbb")).toBeVisible();
  await expect(frame.locator("#entry-99999999")).toHaveCount(0);
  await expect(alternate).toHaveClass(/active/);
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await frame
    .getByRole("button", { name: "Toggle thinking", exact: true })
    .click();
  const scrollBefore = await frame
    .locator("html")
    .evaluate((element) => element.scrollTop);
  await frame.locator("body").evaluate((body) => {
    body.dataset.retryIdentity = "same-frame";
  });

  failRenderer = false;
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });
  await expect(frame.locator("#entry-aaaabbbb")).toBeVisible();
  await expect(frame.locator("#entry-99999999")).toHaveCount(0);
  await expect(alternate).toHaveClass(/active/);
  await expect(frame.locator("body")).toHaveAttribute(
    "data-retry-identity",
    "same-frame",
  );
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "light",
  );
  await expect(frame.locator("#entry-aaaabbbb .thinking-text")).toBeHidden();
  expect(
    await frame.locator("html").evaluate((element) => element.scrollTop),
  ).toBe(scrollBefore);
});

test("enhancer 503 and timeout retain raw source and offer retry", async ({
  page,
}) => {
  test.setTimeout(35_000);
  const html = await createReviewExportFixture();
  await mockGist(page, html);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pi-share-viewer-theme", "light");
    } catch {
      // Sandboxed srcdoc frames have an opaque origin; the parent value is enough.
    }
  });
  let attempt = 0;
  await page.route("**/assets/mermaid-enhancer.js", async (route) => {
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({ status: 503, body: "enhancer unavailable" });
      return;
    }
    if (attempt === 2) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      await route.fallback().catch(() => undefined);
      return;
    }
    await route.fallback();
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "light",
  );
  expect(
    await frame
      .locator("html")
      .evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe("light");
  await expect(frame.locator(".pi-math").first()).toContainText("$x_i$");
  await expect(page.locator("#enhancement-message")).toContainText(
    "enhancement unavailable",
  );
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(page.locator("#enhancement-message")).toContainText(
    "Enhancement loading timed out",
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
});

test("renderer initialization failure keeps retry available", async ({
  page,
}) => {
  test.setTimeout(35_000);
  await mockGist(page, await createReviewExportFixture());
  let failRenderer = true;
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    if (failRenderer) {
      await route.fulfill({
        body: 'throw new Error("broken renderer fixture");',
        contentType: "application/javascript",
        status: 200,
      });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const card = frame.locator('[id="11111111-diagram-1"]');
  await card.scrollIntoViewIfNeeded();
  await expect(page.locator("#enhancement-message")).toContainText(
    "Renderer failed to initialize",
    { timeout: 15_000 },
  );
  await expect(
    page.getByRole("button", { name: "Retry enhancements" }),
  ).toBeVisible();
  await expect(card).toHaveAttribute(
    "data-pi-mermaid-state",
    "waiting-runtime",
  );

  failRenderer = false;
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
    timeout: 30_000,
  });
  await expect(page.locator("#enhancement-status")).toBeHidden();
});

test("late runtime success clears its stale failure status", async ({
  page,
}) => {
  await mockGist(page, await createReviewExportFixture());
  await page.route("**/assets/mermaid-renderer.js", (route) =>
    route.fulfill({
      body: 'throw new Error("broken renderer fixture");',
      contentType: "application/javascript",
      status: 200,
    }),
  );
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
  await expect(page.locator("#enhancement-message")).toContainText(
    "Renderer failed to initialize",
    { timeout: 15_000 },
  );
  const loadId = await frame
    .locator('meta[name="pi-load-id"]')
    .getAttribute("content");
  if (!loadId) throw new Error("Session load ID is missing");
  await frame.locator("body").evaluate((_, id) => {
    window.parent.postMessage(
      {
        type: "pi-share-viewer-runtime-active",
        loadId: id,
        kind: "renderer",
      },
      "*",
    );
  }, loadId);
  await expect(page.locator("#enhancement-status")).toBeHidden();
});

test("enhancer initialization failure keeps retry available", async ({
  page,
}) => {
  await mockGist(page, await createReviewExportFixture());
  let failEnhancer = true;
  await page.route("**/assets/mermaid-enhancer.js", async (route) => {
    if (failEnhancer) {
      await route.fulfill({
        body: 'throw new Error("broken enhancer fixture");',
        contentType: "application/javascript",
        status: 200,
      });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".pi-math").first()).toContainText("$x_i$");
  await expect(page.locator("#enhancement-message")).toContainText(
    "Enhancer failed to initialize",
  );
  await expect(
    page.getByRole("button", { name: "Retry enhancements" }),
  ).toBeVisible();
  await frame.locator("body").evaluate((body) => {
    body.dataset.retryIdentity = "same-frame";
  });

  failEnhancer = false;
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
  await expect(frame.locator("body")).toHaveAttribute(
    "data-retry-identity",
    "same-frame",
  );
  await expect(page.locator("#enhancement-status")).toBeHidden();
});

test("bootstrap failures and missing readiness stay retryable", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await mockGist(page, await createReviewExportFixture());
  let attempt = 0;
  await page.route("**/assets/mermaid-bootstrap.js", async (route) => {
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({ status: 503, body: "bootstrap unavailable" });
      return;
    }
    if (attempt === 2) {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: 'throw new Error("broken bootstrap fixture");',
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(`/session/#${DARK_GIST_ID}`);
  await expect(
    page.getByRole("button", { name: "Retry session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry session" }).click();
  const frame = page.frameLocator("#preview");
  await expect(
    frame
      .locator("#entry-22222222")
      .getByText(/base conversation is readable before optional rendering/i),
  ).toBeVisible();
  await expect(page.locator("#enhancement-message")).toContainText(
    "Session bootstrap failed to initialize",
    { timeout: 10_000 },
  );
  await expect(
    page.getByRole("button", { name: "Retry enhancements" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(6, { timeout: 15_000 });
});

test("transient session failures remain retryable", async ({ page }) => {
  const html = replaceSessionText(
    await createReviewExportFixture(),
    "Review the session viewer reading workflow.",
    "Recovered session. Review the session viewer reading workflow.",
  );
  let attempts = 0;
  await page.route("https://api.github.com/gists/**", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 500, body: "temporary" });
      return;
    }
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
  await page.goto(`/session/#${DARK_GIST_ID}`);
  await expect(
    page.getByRole("button", { name: "Retry session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry session" }).click();
  await expect(
    page
      .frameLocator("#preview")
      .locator("#entry-11111111")
      .getByText(/Recovered session/),
  ).toBeVisible();
});

test("stale retry and unexpected child messages cannot affect a newer load", async ({
  page,
}) => {
  const first = await createReviewExportFixture();
  const second = replaceSessionText(
    first,
    "Review the session viewer reading workflow.",
    "Latest isolated session. Review the session viewer reading workflow.",
  );
  await page.route("https://api.github.com/gists/**", (route) => {
    const latest = route.request().url().endsWith(LIGHT_GIST_ID);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        files: {
          "session.html": {
            type: "text/html",
            size: Buffer.byteLength(latest ? second : first),
            truncated: false,
            content: latest ? second : first,
          },
        },
      }),
    });
  });
  let rendererAttempt = 0;
  await page.route("**/assets/mermaid-renderer.js", async (route) => {
    rendererAttempt += 1;
    if (rendererAttempt === 1) {
      await route.fulfill({ status: 503, body: "first failure" });
      return;
    }
    if (rendererAttempt === 2) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.fallback().catch(() => undefined);
  });
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://untrusted.example")) {
      externalRequests.push(request.url());
    }
  });
  await page.goto(`/session/#${DARK_GIST_ID}`);
  await expect(
    page.getByRole("button", { name: "Retry enhancements" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry enhancements" }).click();
  await page.evaluate((gist) => {
    window.location.hash = gist;
  }, LIGHT_GIST_ID);
  const frame = page.frameLocator("#preview");
  await expect(
    frame.locator("#entry-11111111").getByText(/Latest isolated session/),
  ).toBeVisible();
  await frame.locator("body").evaluate(() => {
    window.parent.postMessage(
      {
        type: "pi-share-viewer-runtime-request",
        url: "https://untrusted.example/executable.js",
      },
      "*",
    );
  });
  await page.waitForTimeout(800);
  await expect(
    frame.locator("#entry-11111111").getByText(/Latest isolated session/),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
});
