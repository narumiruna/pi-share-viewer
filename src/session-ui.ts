import { writeClipboard } from "./clipboard.js";
import { installSessionNavigation } from "./session-navigation.js";
import { installSessionStyle } from "./session-style.js";

export type SessionMode = "inspect" | "reading";

interface SessionRenderDetail {
  currentLeafId?: unknown;
  currentTargetId?: unknown;
  scrollToEntryId?: unknown;
}

interface SessionEntry {
  id?: unknown;
  message?: { role?: unknown; toolCallId?: unknown };
  type?: unknown;
}

interface SessionData {
  entries?: SessionEntry[];
}

declare global {
  var __PI_SESSION_COPY__:
    | ((text: string, button?: HTMLButtonElement) => Promise<void>)
    | undefined;
}

function readSessionData(): SessionData {
  const encoded = document.getElementById("session-data")?.textContent?.trim();
  if (!encoded) return {};
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as SessionData;
  } catch {
    return {};
  }
}

function addRole(element: HTMLElement, label: string): void {
  if (element.querySelector(":scope > .pi-message-role")) return;
  const role = document.createElement("div");
  role.className = "pi-message-role";
  role.textContent = label;
  element.prepend(role);
}

function createDisclosure(
  container: HTMLElement,
  label: string,
  defaultOpen: boolean,
): void {
  if (container.dataset.piDisclosure === "true") return;
  container.dataset.piDisclosure = "true";
  container.removeAttribute("onclick");
  const details = document.createElement("details");
  for (const className of container.classList) details.classList.add(className);
  details.classList.remove("expandable", "expanded");
  details.classList.add("pi-session-disclosure");
  details.dataset.piDisclosure = "true";
  details.open = defaultOpen;
  const summary = document.createElement("summary");
  summary.textContent = label;
  const body = document.createElement("div");
  body.className = "pi-session-disclosure-body";
  for (const child of [...container.childNodes]) {
    if (child instanceof Element) {
      if (child.matches(".system-prompt-header, .tools-header")) continue;
      if (
        container.classList.contains("system-prompt") &&
        child.matches(".system-prompt-preview, .system-prompt-expand-hint")
      ) {
        continue;
      }
      if (
        child instanceof HTMLElement &&
        child.matches(".system-prompt-full")
      ) {
        child.style.display = "block";
      }
    }
    body.append(child);
  }
  details.append(summary, body);
  container.replaceWith(details);
}

function ensureToolDisclosure(
  tool: HTMLElement,
  boundDisclosures: WeakSet<HTMLButtonElement>,
): void {
  tool.dataset.piToolDisclosure = "true";
  if (tool.dataset.piDetailsOpen !== "true") {
    tool.dataset.piDetailsOpen = "false";
  }
  let toggle = tool.querySelector<HTMLButtonElement>(
    ":scope > .pi-entry-disclosure",
  );
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "pi-entry-disclosure";
    const role = tool.querySelector(":scope > .pi-message-role");
    if (role) role.after(toggle);
    else tool.prepend(toggle);
  }
  const sync = () => {
    const open = tool.dataset.piDetailsOpen === "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide tool details" : "Show tool details";
  };
  sync();
  if (boundDisclosures.has(toggle)) return;
  boundDisclosures.add(toggle);
  toggle.addEventListener("click", () => {
    tool.dataset.piDetailsOpen = String(tool.dataset.piDetailsOpen !== "true");
    sync();
  });
}

export function installSessionUi(): () => void {
  installSessionStyle();
  const root = document.documentElement;
  let mode: SessionMode = "reading";
  let showThinking = false;
  let showTools = false;
  const copySequences = new WeakMap<HTMLButtonElement, number>();
  const boundDisclosures = new WeakSet<HTMLButtonElement>();

  const applyPreferences = () => {
    root.dataset.piSessionMode = mode;
    root.dataset.piShowThinking = String(showThinking);
    root.dataset.piShowTools = String(showTools);
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-action="toggle-thinking"]',
    )) {
      button.textContent = showThinking ? "Hide thinking" : "Show thinking";
      button.setAttribute("aria-pressed", String(showThinking));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-action="toggle-tools"]',
    )) {
      button.textContent = showTools ? "Hide tools" : "Show tools";
      button.setAttribute("aria-pressed", String(showTools));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".pi-session-mode",
    )) {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(active));
    }
  };

  const setMode = (nextMode: SessionMode) => {
    mode = nextMode;
    showThinking = nextMode === "inspect";
    showTools = nextMode === "inspect";
    applyPreferences();
  };

  const enhanceHeader = () => {
    const header = document.querySelector<HTMLElement>(".header");
    if (header && !header.querySelector(".pi-session-modes")) {
      const modes = document.createElement("div");
      modes.className = "pi-session-modes";
      modes.setAttribute("role", "group");
      modes.setAttribute("aria-label", "Session view mode");
      for (const [value, label] of [
        ["reading", "Reading"],
        ["inspect", "Inspect"],
      ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pi-session-mode";
        button.dataset.mode = value;
        button.textContent = label;
        button.addEventListener("click", () => setMode(value));
        modes.append(button);
      }
      header.querySelector("h1")?.after(modes);
    }

    const hint = document.querySelector<HTMLElement>(".help-hint");
    if (hint) hint.textContent = "Reading controls affect conversation content";
    for (const [selector, action] of [
      [
        '[data-action="toggle-thinking"]',
        () => {
          showThinking = !showThinking;
        },
      ],
      [
        '[data-action="toggle-tools"]',
        () => {
          showTools = !showTools;
        },
      ],
    ] as const) {
      const current = document.querySelector<HTMLButtonElement>(selector);
      if (!current || current.dataset.piSessionControl === "true") continue;
      const button = current.cloneNode(true) as HTMLButtonElement;
      button.dataset.piSessionControl = "true";
      button.removeAttribute("title");
      current.replaceWith(button);
      button.addEventListener("click", () => {
        action();
        applyPreferences();
      });
    }

    const open = mode === "inspect";
    for (const prompt of document.querySelectorAll<HTMLElement>(
      ".system-prompt:not([data-pi-disclosure])",
    )) {
      createDisclosure(prompt, "System Prompt", open);
    }
    for (const tools of document.querySelectorAll<HTMLElement>(
      ".tools-list:not([data-pi-disclosure])",
    )) {
      createDisclosure(tools, "Available Tools", open);
    }
    applyPreferences();
  };

  const enhanceMessages = () => {
    for (const message of document.querySelectorAll<HTMLElement>(
      ".user-message",
    ))
      addRole(message, "User");
    for (const message of document.querySelectorAll<HTMLElement>(
      ".assistant-message",
    ))
      addRole(message, "Assistant");
    for (const message of document.querySelectorAll<HTMLElement>(
      ".tool-execution",
    )) {
      addRole(message, "Tool");
      ensureToolDisclosure(message, boundDisclosures);
    }
    for (const message of document.querySelectorAll<HTMLElement>(
      ".hook-message",
    ))
      addRole(message, "Custom");
    for (const message of document.querySelectorAll<HTMLElement>(
      ".skill-invocation",
    ))
      addRole(message, "Skill");
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".copy-link-btn",
    )) {
      button.setAttribute("aria-label", "Copy link to this message");
    }
    applyPreferences();
  };

  const entries = readSessionData().entries ?? [];
  const entryById = new Map(
    entries
      .filter((entry): entry is SessionEntry & { id: string } =>
        Boolean(typeof entry.id === "string"),
      )
      .map((entry) => [entry.id, entry]),
  );
  const revealTarget = (detail: SessionRenderDetail) => {
    const requested =
      typeof detail.scrollToEntryId === "string"
        ? detail.scrollToEntryId
        : typeof detail.currentTargetId === "string"
          ? detail.currentTargetId
          : undefined;
    for (const tool of document.querySelectorAll<HTMLElement>(
      '.tool-execution[data-pi-revealed="true"]',
    )) {
      tool.removeAttribute("data-pi-revealed");
    }
    if (!requested) return;
    const entry = entryById.get(requested);
    let target: HTMLElement | null = document.getElementById(
      `entry-${requested}`,
    );
    if (
      entry?.type === "message" &&
      entry.message?.role === "toolResult" &&
      typeof entry.message.toolCallId === "string"
    ) {
      target = document.getElementById(`tool-call-${entry.message.toolCallId}`);
    }
    if (!target) return;
    if (target.classList.contains("tool-execution")) {
      target.dataset.piRevealed = "true";
      target.dataset.piDetailsOpen = "true";
      const toggle = target.querySelector<HTMLButtonElement>(
        ":scope > .pi-entry-disclosure",
      );
      if (toggle) {
        toggle.textContent = "Hide tool details";
        toggle.setAttribute("aria-expanded", "true");
      }
    }
  };

  globalThis.__PI_SESSION_COPY__ = async (text, button) => {
    if (!button) {
      await writeClipboard(text);
      return;
    }
    const sequence = (copySequences.get(button) ?? 0) + 1;
    copySequences.set(button, sequence);
    let status = button.parentElement?.querySelector<HTMLElement>(
      ":scope > .pi-action-status",
    );
    if (!status) {
      status = document.createElement("span");
      status.className = "pi-action-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      button.after(status);
    }
    status.textContent = "Copying link…";
    try {
      const result = await writeClipboard(text);
      if (copySequences.get(button) !== sequence) return;
      status.textContent =
        result.method === "fallback"
          ? "Link copied using browser fallback"
          : "Link copied";
    } catch (error) {
      if (copySequences.get(button) !== sequence) return;
      status.textContent =
        error instanceof Error ? error.message : "Unable to copy link.";
    }
  };

  const onHeader = () => enhanceHeader();
  const onRender = (event: Event) => {
    enhanceHeader();
    enhanceMessages();
    revealTarget((event as CustomEvent<SessionRenderDetail>).detail ?? {});
  };
  document.addEventListener("pi-session-header-render", onHeader);
  document.addEventListener("pi-session-render", onRender);

  enhanceHeader();
  enhanceMessages();
  const navigationCleanup = installSessionNavigation(entries);

  return () => {
    document.removeEventListener("pi-session-header-render", onHeader);
    document.removeEventListener("pi-session-render", onRender);
    navigationCleanup();
    delete globalThis.__PI_SESSION_COPY__;
  };
}
