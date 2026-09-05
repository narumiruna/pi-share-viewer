import { expect, test } from "@playwright/test";
import { MAX_SESSION_HTML_BYTES } from "../../src/gist.js";
import {
  createExportFixture,
  DARK_GIST_ID,
  LIGHT_GIST_ID,
  mockGist,
  readSessionData,
  renderEntryDiagrams,
  replaceSessionText,
} from "./session-fixture.js";

test("loads a real Pi export and enhances Mermaid diagrams", async ({
  page,
}) => {
  test.setTimeout(45_000);
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
  const renderError = frame.locator(".pi-mermaid-error");
  await expect(renderError).toContainText("Mermaid syntax error near line 3");
  await expect(renderError.getByText("Technical details")).toBeVisible();
  await renderError.getByText("Technical details").click();
  await expect(renderError.locator(".pi-mermaid-error-details")).toContainText(
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
  await expect(stage).toHaveAttribute("style", /scale\(1\.25\)/);
  await expect(card.getByLabel("Current zoom")).toHaveText("125%");
  await card.getByRole("button", { name: "Zoom out" }).click();
  await expect(stage).toHaveAttribute("style", /scale\(1\)/);
  await card.getByRole("button", { name: "Fit diagram" }).click();

  const viewport = card.locator(".pi-mermaid-viewport");
  for (let index = 0; index < 6; index += 1) {
    await card.getByRole("button", { name: "Zoom in" }).click();
  }
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) throw new Error("Mermaid viewport is not visible");
  const transformBeforePan = await stage.getAttribute("style");
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
  expect(await stage.getAttribute("style")).not.toBe(transformBeforePan);

  await card.getByRole("button", { name: "Reset view" }).click();
  await expect(stage).toHaveAttribute("style", /scale\(1\)/);
  await expect(card.getByLabel("Current zoom")).toHaveText("100%");

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
  const copySourceButton = card.getByRole("button", { name: "Copy source" });
  await copySourceButton.focus();
  await copySourceButton.click();
  await expect(card.getByText("Source copied", { exact: true })).toBeAttached();
  await expect(copySourceButton).toBeFocused();
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
  await expect
    .poll(() =>
      card.evaluate((element) => {
        const viewport = element.querySelector(".pi-mermaid-viewport");
        const svg = element.querySelector(".pi-mermaid-stage > svg");
        if (!viewport || !svg) return false;
        const viewportBox = viewport.getBoundingClientRect();
        const svgBox = svg.getBoundingClientRect();
        return (
          svgBox.width <= viewportBox.width + 1 &&
          svgBox.height <= viewportBox.height + 1
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/fullscreen-dark.png" });
  await viewport.focus();
  await viewport.press("Escape");
  await expect(card).not.toHaveClass(/pi-mermaid-expanded/);
  await expect(
    card.getByRole("button", { name: "Open fullscreen" }),
  ).toBeVisible();
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

  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "dark");
  const diagramSvg = card.locator(".pi-mermaid-stage > svg");
  const darkSvg = await diagramSvg.evaluate((svg) => svg.outerHTML);
  await card.getByRole("button", { name: "Show source" }).click();
  await expect(viewport).toBeHidden();
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "light",
  );
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "light");
  await expect(card).toHaveAttribute("data-pi-mermaid-needs-fit", "true");
  expect(await diagramSvg.evaluate((svg) => svg.outerHTML)).not.toBe(darkSvg);
  await card.getByRole("button", { name: "Show diagram" }).click();
  await expect(viewport).toBeVisible();
  await expect(card).not.toHaveAttribute("data-pi-mermaid-needs-fit");
  expect(
    await frame.locator("html").evaluate((html) => ({
      customMessageLabel: getComputedStyle(html)
        .getPropertyValue("--customMessageLabel")
        .trim(),
      customMessageText: getComputedStyle(html)
        .getPropertyValue("--customMessageText")
        .trim(),
    })),
  ).toEqual({
    customMessageLabel: "#6550b9",
    customMessageText: "#1c2024",
  });
  await expect(
    frame.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("pi-share-viewer-theme")),
    )
    .toBe("light");

  const iframe = page.locator("#preview");
  await expect(iframe).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-downloads",
  );
  await expect(iframe).toHaveAttribute("allow", "fullscreen");
  await expect(iframe).not.toHaveAttribute("sandbox", /allow-same-origin/);
  expect(cspErrors).toEqual([]);
});

test("supports natural sizing, scroll-safe camera controls, styles, focus, and accessibility", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const html = await createExportFixture();
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 1);
  const card = frame.locator("#a1b2c3d4-diagram-1");
  const viewport = card.locator(".pi-mermaid-viewport");
  const svg = card.locator(".pi-mermaid-stage > svg");
  const sizes = await card.evaluate((element) => {
    const viewport = element.querySelector(".pi-mermaid-viewport");
    const svg = element.querySelector(".pi-mermaid-stage > svg");
    if (!(viewport instanceof HTMLElement) || !(svg instanceof SVGSVGElement)) {
      throw new Error("Diagram view is missing");
    }
    return {
      svgWidth: svg.getBoundingClientRect().width,
      touchAction: getComputedStyle(viewport).touchAction,
      viewportWidth: viewport.getBoundingClientRect().width,
    };
  });
  expect(sizes.svgWidth).toBeLessThan(sizes.viewportWidth * 0.75);
  expect(sizes.touchAction).toBe("pan-y");
  await expect(card).toHaveAttribute(
    "aria-labelledby",
    "a1b2c3d4-diagram-1-caption",
  );
  await expect(viewport).toHaveAttribute("role", "region");
  await expect(svg).toHaveAttribute("role", /graphics-document/);
  await expect(svg.locator("title")).toHaveCount(1);
  await expect(
    card.getByRole("button", { name: "Show source" }),
  ).toHaveAttribute("aria-controls", "a1b2c3d4-diagram-1-source");

  const wheelResult = await viewport.evaluate((element) => {
    const before =
      element.querySelector<HTMLElement>(".pi-mermaid-stage")?.style.transform;
    const ordinary = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -10,
    });
    const ordinaryDispatched = element.dispatchEvent(ordinary);
    const modified = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 150,
      clientY: 80,
      ctrlKey: true,
      deltaY: -10,
    });
    const modifiedDispatched = element.dispatchEvent(modified);
    return {
      after:
        element.querySelector<HTMLElement>(".pi-mermaid-stage")?.style
          .transform,
      before,
      modifiedDispatched,
      ordinaryDispatched,
    };
  });
  expect(wheelResult.ordinaryDispatched).toBe(true);
  expect(wheelResult.modifiedDispatched).toBe(false);
  expect(wheelResult.after).not.toBe(wheelResult.before);

  await viewport.focus();
  await viewport.press("+");
  await expect(card.getByLabel("Current zoom")).not.toHaveText("100%");
  await viewport.press("0");
  await expect(card.getByLabel("Current zoom")).toHaveText("100%");

  await card.getByRole("button", { name: "Use original style" }).click();
  await expect(svg).not.toHaveClass(/pi-mermaid-polished/);
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "light");
  await expect(svg).not.toHaveClass(/pi-mermaid-polished/);
  await card.getByRole("button", { name: "Use polished style" }).click();
  await expect(svg).toHaveClass(/pi-mermaid-polished/);
  await frame.getByRole("button", { name: "Switch to dark theme" }).click();
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(frame.locator("html")).toHaveAttribute(
    "data-pi-mermaid-theme",
    "light",
  );
  await expect(card).toHaveAttribute("data-pi-mermaid-render-theme", "light");
  await expect(
    frame.getByRole("button", { name: "Switch to dark theme" }),
  ).not.toHaveAttribute("aria-busy");

  const firstNode = card.locator("g.node").first();
  await firstNode.click();
  await expect(svg).toHaveClass(/pi-mermaid-focused/);
  await expect(firstNode).toHaveAttribute("data-pi-selected", "true");
  await expect(
    card.locator('[data-pi-edge="true"][data-pi-related="true"]'),
  ).toHaveCount(1);

  const trace = card.getByRole("button", { name: "Trace edges" });
  await trace.click();
  const animationName = await card
    .locator('[data-pi-edge="true"]')
    .first()
    .evaluate((edge) => getComputedStyle(edge).animationName);
  expect(animationName).toBe("none");

  const pinchChanged = await viewport.evaluate((element) => {
    const target = element as HTMLElement & {
      setPointerCapture(pointerId: number): void;
    };
    target.setPointerCapture = () => undefined;
    const stage = element.querySelector<HTMLElement>(".pi-mermaid-stage");
    const before = stage?.style.transform;
    const dispatch = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerId,
          pointerType: "touch",
        }),
      );
    dispatch("pointerdown", 1, 100, 100);
    dispatch("pointerdown", 2, 200, 100);
    dispatch("pointermove", 2, 260, 100);
    dispatch("pointerup", 1, 100, 100);
    dispatch("pointerup", 2, 260, 100);
    return stage?.style.transform !== before;
  });
  expect(pinchChanged).toBe(true);

  await viewport.press("0");
  await page.setViewportSize({ width: 900, height: 700 });
  await expect
    .poll(() =>
      card.evaluate((element) => {
        const viewport = element.querySelector(".pi-mermaid-viewport");
        const svg = element.querySelector(".pi-mermaid-stage > svg");
        if (!viewport || !svg) return false;
        const viewportBox = viewport.getBoundingClientRect();
        const svgBox = svg.getBoundingClientRect();
        return (
          svgBox.width <= viewportBox.width + 1 &&
          svgBox.height <= viewportBox.height + 1
        );
      }),
    )
    .toBe(true);

  const sessionDocument = frame.locator("html");
  const initialScroll = await sessionDocument.evaluate(
    (element) => element.scrollTop,
  );
  await viewport.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => sessionDocument.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScroll);
});

test("preserves Pi message deep links and JSONL downloads", async ({
  page,
}) => {
  const html = await createExportFixture();
  const session = readSessionData(html);
  const targetId = session.entries.find(
    (entry) => entry.type === "message" && entry.id !== session.leafId,
  )?.id;
  if (!targetId) throw new Error("Fixture needs a non-leaf message entry");

  await mockGist(page, html);
  await page.goto(
    `/session/#${DARK_GIST_ID}&targetId=${targetId}&leafId=${session.leafId}`,
  );

  const frame = page.frameLocator("#preview");
  await expect(page.locator("#error")).toBeHidden();
  await expect(frame.locator(`#entry-${targetId}`)).toBeVisible();
  await expect(frame.locator('meta[name="pi-url-params"]')).toHaveAttribute(
    "content",
    `leafId=${session.leafId}&targetId=${targetId}`,
  );

  await frame.locator("body").evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          (
            window as Window & { copiedSessionLink?: string }
          ).copiedSessionLink = text;
          return Promise.resolve();
        },
      },
    });
  });
  await frame.locator(`#entry-${targetId} .copy-link-btn`).click();
  await expect
    .poll(() =>
      frame
        .locator("body")
        .evaluate(
          () =>
            (window as Window & { copiedSessionLink?: string })
              .copiedSessionLink,
        ),
    )
    .toBe(
      `http://127.0.0.1:4173/session/#${DARK_GIST_ID}&leafId=${session.leafId}&targetId=${targetId}`,
    );

  const downloadPromise = page.waitForEvent("download");
  await frame.locator(".download-json-btn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `${session.header?.id ?? "session"}.jsonl`,
  );
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
  await renderEntryDiagrams(frame, 3);
  await expect(
    frame.locator('.pi-mermaid-card[data-pi-mermaid-state="rendered"]'),
  ).toHaveCount(3);
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

test("renders safely at mobile and desktop sizes in dark and light sessions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const darkHtml = await createExportFixture();
  const lightHtml = darkHtml.replace(
    /<head(?:\s[^>]*)?>/i,
    "$&<style>html,body{background:#fff!important;color:#18181b!important}</style>",
  );
  await mockGist(page, lightHtml);

  for (const viewport of [
    { width: 320, height: 800, name: "small-mobile" },
    { width: 360, height: 800, name: "mobile" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1440, height: 900, name: "desktop" },
    { width: 1920, height: 1080, name: "wide" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/session/#${LIGHT_GIST_ID}`);
    const frame = page.frameLocator("#preview");
    await renderEntryDiagrams(frame, 1);
    await expect(
      frame.locator(".pi-mermaid-card svg.pi-mermaid-polished"),
    ).toBeVisible();
    const renderedCard = frame.locator(
      '.pi-mermaid-card[data-pi-mermaid-state="rendered"]',
    );
    await expect(renderedCard).toHaveCount(1);
    for (const control of [
      "Zoom out",
      "Zoom in",
      "Fit diagram",
      "Open fullscreen",
    ]) {
      await expect(
        renderedCard.getByRole("button", { name: control, exact: true }),
      ).toBeVisible();
    }
    if (viewport.width <= 640) {
      await renderedCard
        .getByRole("button", { name: "More diagram actions" })
        .click();
    }
    for (const control of [
      "Reset view",
      "Trace edges",
      "Show source",
      "Copy source",
      "Copy SVG",
      "Download SVG",
      "Download PNG",
      "Copy diagram link",
    ]) {
      await expect(
        renderedCard.getByRole("button", { name: control, exact: true }),
      ).toBeVisible();
    }
    if (viewport.width <= 640) {
      const targetSize = await renderedCard
        .getByRole("button", { name: "Zoom in" })
        .evaluate((button) => ({
          height: button.getBoundingClientRect().height,
          width: button.getBoundingClientRect().width,
        }));
      expect(targetSize.width).toBeGreaterThanOrEqual(44);
      expect(targetSize.height).toBeGreaterThanOrEqual(44);
      await renderedCard
        .getByRole("button", { name: "More diagram actions" })
        .click();
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
    await frame.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(renderedCard).toHaveAttribute(
      "data-pi-mermaid-render-theme",
      "dark",
    );
    await page.screenshot({
      path: `test-results/${viewport.name}-dark.png`,
      fullPage: true,
    });
    await frame.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(renderedCard).toHaveAttribute(
      "data-pi-mermaid-render-theme",
      "light",
    );
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
  await renderEntryDiagrams(frame, 3);
  await expect(
    frame.locator('.pi-mermaid-card[data-pi-mermaid-state="rendered"]'),
  ).toHaveCount(3);
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

test("preserves authored Mermaid metadata and characterizes supported relationships", async ({
  page,
}) => {
  const sourceHtml = await createExportFixture();
  const html = replaceSessionText(
    sourceHtml,
    "A normal Markdown paragraph.",
    `A normal Markdown paragraph.

\`\`\`mermaid
flowchart LR
  accTitle: Styled flow
  accDescr: Browser sends data to API
  subgraph Client
    Browser[Browser]
  end
  Browser -->|request| API[API]
  classDef custom fill:#f00,stroke:#0f0,color:#fff
  class Browser custom
  style API fill:#00f,stroke:#ff0
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant Browser
  participant API
  Note over Browser,API: Local only
  Browser->>API: Request
\`\`\`

\`\`\`mermaid
stateDiagram-v2
  [*] --> Ready
  Ready --> Done: run
\`\`\``,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 4);
  await expect(
    frame.locator('.pi-mermaid-card[data-pi-mermaid-state="rendered"]'),
  ).toHaveCount(4);

  const styled = frame
    .locator('[data-pi-mermaid-kind="flowchart"]')
    .filter({ has: frame.locator("g.node.custom") });
  await expect(styled.locator(".pi-mermaid-stage > svg title")).toHaveText(
    "Styled flow",
  );
  await expect(styled.locator(".pi-mermaid-stage > svg desc")).toContainText(
    "Browser sends data to API",
  );
  await expect(styled.locator("g.node.custom")).toHaveCount(1);
  await expect(styled.locator(".cluster")).toHaveCount(1);
  expect(
    await styled
      .locator("g.node.custom > rect")
      .evaluate((rect) => getComputedStyle(rect).fill),
  ).toBe("rgb(255, 0, 0)");
  expect(
    await styled
      .locator("g.node", { hasText: "API" })
      .locator(":scope > rect")
      .evaluate((rect) => getComputedStyle(rect).fill),
  ).toBe("rgb(0, 0, 255)");
  await expect(styled.locator('path[data-id="L_Browser_API_0"]')).toHaveCount(
    1,
  );

  const sequence = frame.locator('[data-pi-mermaid-kind="sequence"]');
  await expect(sequence.locator(".note")).toHaveCount(1);
  await expect(sequence.locator('[data-id="i0"]')).toHaveCount(1);
  const state = frame.locator('[data-pi-mermaid-kind="state"]');
  await expect(state.locator('path[data-id="edge0"]')).toHaveCount(1);

  await styled.screenshot({ path: "test-results/authored-style-dark.png" });
  await frame.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(styled).toHaveAttribute("data-pi-mermaid-render-theme", "light");
  expect(
    await styled
      .locator("g.node.custom > rect")
      .evaluate((rect) => getComputedStyle(rect).fill),
  ).toBe("rgb(255, 0, 0)");
  await styled.screenshot({ path: "test-results/authored-style-light.png" });
});

test("renders generic controls for additional Mermaid diagram kinds", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const sourceHtml = await createExportFixture();
  const html = replaceSessionText(
    sourceHtml,
    "A normal Markdown paragraph.",
    `A normal Markdown paragraph.

\`\`\`mermaid
classDiagram
  User --> Session
\`\`\`

\`\`\`mermaid
erDiagram
  USER ||--o{ SESSION : owns
\`\`\`

\`\`\`mermaid
gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
  Compile :a, 2026-01-01, 1d
\`\`\`

\`\`\`mermaid
pie title Usage
  "A" : 60
  "B" : 40
\`\`\`

\`\`\`mermaid
mindmap
  root((Viewer))
    Mermaid
\`\`\`

\`\`\`mermaid
timeline
  title Release
  2026 : Launch
\`\`\`

\`\`\`mermaid
gitGraph
  commit id: "start"
\`\`\``,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);

  const frame = page.frameLocator("#preview");
  await renderEntryDiagrams(frame, 8);
  await expect(
    frame.locator('.pi-mermaid-card[data-pi-mermaid-state="rendered"]'),
  ).toHaveCount(8);
  const genericCards = frame.locator(
    '.pi-mermaid-card[data-pi-mermaid-state="rendered"]:not([data-pi-mermaid-kind="flowchart"])',
  );
  await expect(genericCards).toHaveCount(7);
  await expect(genericCards.locator("svg.pi-mermaid-polished")).toHaveCount(0);
  await expect(
    genericCards.getByRole("button", {
      name: /Use (?:original|polished) style/,
    }),
  ).toHaveCount(0);
  await expect(frame.locator(".pi-mermaid-renderer-frame")).toHaveCount(0);
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
