import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createReviewExportFixture,
  DARK_GIST_ID,
  mockGist,
  readSessionData,
} from "./session-fixture.js";

test("review fixture is sanitized and contains the intended UI evidence", async () => {
  const source = await readFile("tests/fixtures/ui-review.jsonl", "utf8");
  expect(source).not.toContain("c642af06d02c928633adc8866716bded");
  expect(
    source.match(/\\begin\{aligned\}|\$x_i\$|\\unknowncommand/g),
  ).toHaveLength(3);
  expect(source.match(/```mermaid/g)).toHaveLength(2);
  expect(source).toContain('"type":"custom_message"');
  expect(source).toContain('"toolCallId":"tool-custom-1"');
  expect(source).toContain("Alternate branch request");

  const html = await createReviewExportFixture();
  const data = readSessionData(html) as unknown as {
    entries: unknown[];
    systemPrompt: string;
    tools: unknown[];
  };
  expect(data.entries.length).toBeGreaterThanOrEqual(12);
  expect(data.systemPrompt.split("\n")).toHaveLength(28);
  expect(data.tools).toHaveLength(5);
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ["dark", "light"] as const) {
    test(`defaults to readable conversation at ${viewport.width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(45_000);
      await page.setViewportSize(viewport);
      await mockGist(page, await createReviewExportFixture());
      await page.goto(`/session/#${DARK_GIST_ID}`);
      const frame = page.frameLocator("#preview");
      const root = frame.locator("html");
      await expect(
        frame.getByRole("button", { name: /Switch to (?:dark|light) theme/ }),
      ).toBeVisible();
      if ((await root.getAttribute("data-pi-mermaid-theme")) !== theme) {
        await frame
          .getByRole("button", { name: `Switch to ${theme} theme` })
          .click();
      }

      await expect(root).toHaveAttribute("data-pi-session-mode", "reading");
      await expect(
        frame.getByRole("button", { name: "Reading", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const firstUser = frame.locator("#entry-11111111");
      await expect(firstUser).toBeVisible();
      expect(
        await firstUser.evaluate(
          (element) => element.getBoundingClientRect().top,
        ),
      ).toBeLessThan(viewport.height);
      await expect(firstUser.locator(":scope > .pi-message-role")).toHaveText(
        "User",
      );
      await expect(
        frame.locator("#entry-22222222 > .pi-message-role"),
      ).toHaveText("Assistant");
      await expect(
        frame.locator("#entry-88888888 > .pi-message-role"),
      ).toHaveText("Custom");
      await expect(
        frame.getByText("System Prompt", { exact: true }),
      ).toBeVisible();
      await expect(
        frame.getByText("Available Tools", { exact: true }),
      ).toBeVisible();
      await expect(frame.locator("details.system-prompt")).not.toHaveAttribute(
        "open",
        "",
      );
      await expect(frame.locator("details.tools-list")).not.toHaveAttribute(
        "open",
        "",
      );
      await expect(
        frame.getByRole("button", { name: "Show tools", exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        frame.getByRole("button", { name: "Show thinking", exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        await frame
          .locator(".tool-execution")
          .evaluateAll(
            (tools) =>
              tools.filter((tool) => getComputedStyle(tool).display !== "none")
                .length,
          ),
      ).toBe(0);
      expect(
        await root.evaluate((html) => html.scrollWidth <= html.clientWidth + 1),
      ).toBe(true);

      const action = firstUser.getByRole("button", {
        name: "Copy link to this message",
      });
      await action.focus();
      await expect(action).toBeVisible();
      const geometry = await firstUser.evaluate((element) => {
        const timestamp = element.querySelector(".message-timestamp");
        const action = element.querySelector(".copy-link-btn");
        if (!timestamp || !action) return null;
        const range = document.createRange();
        range.selectNodeContents(timestamp);
        const time = range.getBoundingClientRect();
        const button = action.getBoundingClientRect();
        return {
          overlap: time.right > button.left && time.left < button.right,
        };
      });
      expect(geometry?.overlap ?? false).toBe(false);
      await page.screenshot({
        path: `test-results/review-top-${viewport.width}-${theme}.png`,
      });
    });
  }
}

test("Reading and Inspect controls reflect content and survive branch renders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockGist(page, await createReviewExportFixture());
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  const root = frame.locator("html");

  const systemPrompt = frame.locator("details.system-prompt");
  await systemPrompt.locator("summary").click();
  await expect(systemPrompt.locator(".system-prompt-full")).toBeVisible();
  await expect(systemPrompt).toContainText("Sanitized system instruction 28");
  await expect(
    systemPrompt.locator(".system-prompt-preview, .system-prompt-expand-hint"),
  ).toHaveCount(0);
  const availableTools = frame.locator("details.tools-list");
  await availableTools.locator("summary").click();
  await expect(availableTools).toContainText("Sanitized read tool definition");

  await frame.getByRole("button", { name: "Inspect", exact: true }).click();
  await expect(root).toHaveAttribute("data-pi-session-mode", "inspect");
  await expect(
    frame.getByRole("button", { name: "Hide tools", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    frame.getByRole("button", { name: "Hide thinking", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await frame
      .locator(".tool-execution")
      .evaluateAll(
        (tools) =>
          tools.filter((tool) => getComputedStyle(tool).display !== "none")
            .length,
      ),
  ).toBe(5);

  const firstTool = frame.locator(".tool-execution").first();
  await firstTool
    .getByRole("button", { name: "Show tool details", exact: true })
    .click();
  await expect(firstTool).toHaveAttribute("data-pi-details-open", "true");
  await firstTool.evaluate((tool) => {
    tool.replaceWith(tool.cloneNode(true));
    document.dispatchEvent(
      new CustomEvent("pi-session-render", {
        detail: { currentTargetId: "22222222" },
      }),
    );
  });
  const clonedDisclosure = firstTool.locator(":scope > .pi-entry-disclosure");
  await expect(clonedDisclosure).toHaveText("Hide tool details");
  await expect(clonedDisclosure).toHaveAttribute("aria-expanded", "true");
  await clonedDisclosure.click();
  await expect(firstTool).toHaveAttribute("data-pi-details-open", "false");
  await expect(clonedDisclosure).toHaveAttribute("aria-expanded", "false");
  await expect(clonedDisclosure).toHaveText("Show tool details");

  await frame.getByRole("button", { name: "Reading", exact: true }).click();
  await frame
    .getByRole("button", { name: "Show thinking", exact: true })
    .click();
  await expect(root).toHaveAttribute("data-pi-show-thinking", "true");
  await frame.locator('.tree-node[data-id="aaaabbbb"] .pi-tree-action').click();
  await expect(frame.locator("#entry-aaaabbbb")).toBeFocused();
  await expect(root).toHaveAttribute("data-pi-show-thinking", "true");
  await expect(root).toHaveAttribute("data-pi-show-tools", "false");
  await expect(
    frame.getByRole("button", { name: "Hide thinking", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    frame.getByRole("button", { name: "Show tools", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(frame.locator("#entry-aaaabbbb .pi-message-role")).toHaveCount(
    1,
  );
});
