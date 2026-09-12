import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, type FrameLocator, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
export const DARK_GIST_ID = "2b736fe885c106e7ee125d52b1cfecbb";
export const LIGHT_GIST_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const generatedDirectory = resolve("tests/.generated");
const generatedSession = (name: string) =>
  resolve(generatedDirectory, `${name}-${process.pid}.html`);

async function exportFixture(name: string, fixture: string): Promise<string> {
  await mkdir(generatedDirectory, { recursive: true });
  const output = generatedSession(name);
  await execFileAsync(resolve("node_modules/.bin/pi"), [
    "--export",
    resolve(fixture),
    output,
  ]);
  return readFile(output, "utf8");
}

export async function createExportFixture(): Promise<string> {
  return exportFixture("session", "tests/fixtures/session.jsonl");
}

export async function createReviewExportFixture(): Promise<string> {
  const html = await exportFixture(
    "ui-review",
    "tests/fixtures/ui-review.jsonl",
  );
  const match =
    /(<script id="session-data" type="application\/json">\s*)([^<]+)(\s*<\/script>)/i.exec(
      html,
    );
  if (!match) throw new Error("Pi export is missing session-data");
  const payload = JSON.parse(
    Buffer.from(match[2].trim(), "base64").toString("utf8"),
  ) as Record<string, unknown>;
  payload.systemPrompt = Array.from(
    { length: 28 },
    (_, index) =>
      `Sanitized system instruction ${index + 1}: verify readable session behavior without secrets or live services.`,
  ).join("\n");
  payload.tools = ["read", "bash", "edit", "write", "review_status"].map(
    (name) => ({
      name,
      description: `Sanitized ${name} tool definition with deliberately long technical metadata for responsive layout review.`,
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description:
              "Sanitized fixture input used only by local browser tests.",
          },
        },
        required: ["input"],
      },
    }),
  );
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return html.replace(match[0], `${match[1]}${encoded}${match[3]}`);
}

export function replaceSessionText(
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
  firstMessage.content = content.replace(original, () => replacement);

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return html.replace(match[0], `${match[1]}${encoded}${match[3]}`);
}

export function readSessionData(html: string): {
  entries: Array<{ id: string; type: string }>;
  header?: { id?: string };
  leafId: string;
} {
  const match =
    /<script id="session-data" type="application\/json">\s*([^<\s]+)\s*<\/script>/i.exec(
      html,
    );
  if (!match) throw new Error("Pi export is missing session-data");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as {
    entries: Array<{ id: string; type: string }>;
    header?: { id?: string };
    leafId: string;
  };
}

export async function renderEntryDiagrams(
  frame: FrameLocator,
  count: number,
): Promise<void> {
  const cards = frame.locator('.pi-mermaid-card[id^="a1b2c3d4-diagram-"]');
  await expect(cards).toHaveCount(count);
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-pi-mermaid-state", "rendered", {
      timeout: 30_000,
    });
  }
}

export async function mockGist(page: Page, html: string): Promise<void> {
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
