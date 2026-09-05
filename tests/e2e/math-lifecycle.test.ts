import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createExportFixture,
  DARK_GIST_ID,
  mockGist,
  readSessionData,
  replaceSessionText,
} from "./session-fixture.js";

interface FixtureEntry {
  id: string;
  type: string;
  parentId: string | null;
  timestamp?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
  summary?: string;
  display?: boolean;
  customType?: string;
  content?: string;
}

function rewrite(
  html: string,
  update: (session: { entries: FixtureEntry[]; leafId: string }) => void,
): string {
  const session = readSessionData(html) as {
    entries: FixtureEntry[];
    leafId: string;
  };
  update(session);
  return html.replace(
    /(<script id="session-data" type="application\/json">)[^<]+(<\/script>)/i,
    (_match, open, close) =>
      `${open}${Buffer.from(JSON.stringify(session)).toString("base64")}${close}`,
  );
}

test("preserves roles, content parts, branch navigation and original JSONL", async ({
  page,
}) => {
  const html = rewrite(await createExportFixture(), (session) => {
    const user = session.entries[0].message;
    const assistant = session.entries[1].message;
    if (!user || !assistant) throw new Error("Missing fixture messages");
    user.content = [
      { type: "text", text: "User $U$." },
      { type: "text", text: "Second $V$." },
    ];
    assistant.content = [
      { type: "text", text: "Assistant $A$." },
      { type: "thinking", thinking: "Thinking $hidden$." },
      { type: "text", text: "Another $B$." },
      { type: "text", text: "$unfinished" },
      { type: "text", text: "separate$" },
    ];
    session.entries.push(
      {
        type: "branch_summary",
        id: "c3d4e5f6",
        parentId: "b2c3d4e5",
        summary: "Summary $S$.",
      },
      {
        type: "custom_message",
        id: "d4e5f6a7",
        parentId: "c3d4e5f6",
        display: true,
        customType: "test",
        content: "Custom $H$.",
      },
      {
        type: "message",
        id: "e5f6a7b8",
        parentId: "a1b2c3d4",
        message: { role: "user", content: "Branch $C$." },
      },
    );
    session.leafId = "d4e5f6a7";
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockGist(page, html);
  await page.goto(
    `/session/#${DARK_GIST_ID}&leafId=d4e5f6a7&targetId=b2c3d4e5`,
  );
  const frame = page.frameLocator("#preview");
  await expect(frame.locator("#entry-a1b2c3d4 .katex")).toHaveCount(2);
  await expect(frame.locator("#entry-b2c3d4e5 .katex")).toHaveCount(2);
  await expect(
    frame.locator(
      ".thinking-block .pi-math, .branch-summary .pi-math, .hook-message .pi-math",
    ),
  ).toHaveCount(0);
  await expect(frame.locator("#entry-c3d4e5f6")).toContainText("Summary $S$.");
  await expect(frame.locator("#entry-d4e5f6a7")).toContainText("Custom $H$.");
  await frame.locator('.tree-node[data-id="e5f6a7b8"]').click();
  await expect(frame.locator("#entry-e5f6a7b8 .katex")).toHaveCount(1);
  await expect(frame.locator("#entry-b2c3d4e5")).toHaveCount(0);
  await frame.locator('.tree-node[data-id="d4e5f6a7"]').click();
  await expect(frame.locator("#entry-b2c3d4e5 .katex")).toHaveCount(2);
  await expect(frame.locator(".pi-math .pi-math")).toHaveCount(0);
  // An unrelated mutation must not cause repeated math DOM replacement.
  const stable = await frame
    .locator("#entry-a1b2c3d4 .katex")
    .first()
    .evaluate(async (element) => {
      let mutations = 0;
      const observer = new MutationObserver((records) => {
        mutations += records.length;
      });
      observer.observe(element.parentElement as Element, {
        childList: true,
        subtree: true,
      });
      document.body.append(document.createElement("span"));
      await new Promise((resolve) => setTimeout(resolve, 100));
      observer.disconnect();
      return mutations;
    });
  expect(stable).toBe(0);
  const downloadPromise = page.waitForEvent("download");
  await frame.locator(".download-json-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const entries = (await readFile(path as string, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries.slice(1)).toEqual(readSessionData(html).entries);
  expect(errors).toEqual([]);
});

test("enhances both skill message call sites while preserving URL sanitization", async ({
  page,
}) => {
  const html = rewrite(await createExportFixture(), (session) => {
    const message = session.entries[0].message;
    if (!message) throw new Error("Missing user");
    message.content =
      '<skill name="math" location="/tmp/math/SKILL.md">\nSkill $S$.\n</skill>\n\nUser \\(U\\). [unsafe](javascript:alert%281%29) [safe](https://example.com)';
  });
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(frame.locator(".skill-invocation-content .katex")).toHaveCount(
    1,
  );
  await expect(
    frame.locator(".skill-user-entry .user-message .katex"),
  ).toHaveCount(1);
  await expect(
    frame.locator('.skill-user-entry a[href^="javascript:"]'),
  ).toHaveCount(0);
  await expect(
    frame.locator('.skill-user-entry a[href="https://example.com"]'),
  ).toHaveText("safe");
});

test("retains oversized and over-count source without blocking later content", async ({
  page,
}) => {
  const oversized = `$${"x".repeat(10_000)}$`;
  const html = replaceSessionText(
    await createExportFixture(),
    "A normal Markdown paragraph.",
    `${oversized}\n\n${Array.from({ length: 502 }, () => "$x$").join(" ")}\n\nAfter math limits.`,
  );
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(
    frame.locator('.pi-math[data-pi-math-state="rendered"]'),
  ).toHaveCount(500, { timeout: 15_000 });
  await expect(
    frame.locator('.pi-math[data-pi-math-state="limited"]'),
  ).toHaveCount(3);
  await expect(
    frame.locator('.pi-math[data-pi-math-state="limited"]').first(),
  ).toHaveText(oversized);
  await expect(frame.getByText("After math limits.")).toBeVisible();
  await expect(frame.locator("#entry-a1b2c3d4 .pi-mermaid-card")).toHaveCount(
    1,
  );
});

test("falls back without partial changes when the export template is incompatible", async ({
  page,
}) => {
  const html = replaceSessionText(
    await createExportFixture(),
    "A normal Markdown paragraph.",
    String.raw`Plain $x$ and \(y\).`,
  ).replace("return marked.parse(text);", "return marked.parse(text, {});");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockGist(page, html);
  await page.goto(`/session/#${DARK_GIST_ID}`);
  const frame = page.frameLocator("#preview");
  await expect(
    frame.getByText("Plain $x$ and (y).", { exact: true }),
  ).toBeVisible();
  await expect(frame.locator(".pi-math")).toHaveCount(0);
  await expect(
    frame.locator("#entry-a1b2c3d4 .pi-mermaid-stage > svg"),
  ).toBeVisible();
  expect(await frame.locator("script").allTextContents()).not.toEqual(
    expect.arrayContaining([
      expect.stringContaining(
        "${(globalThis.__PI_MATH_PARSE__ || safeMarkedParse)",
      ),
    ]),
  );
  expect(errors).toEqual([]);
});
