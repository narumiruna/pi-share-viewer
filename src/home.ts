import {
  applyTheme,
  getPreferredTheme,
  type SiteTheme,
  saveTheme,
} from "./theme.js";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element as T;
}

function updateThemeToggle(button: HTMLButtonElement, theme: SiteTheme): void {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} theme`;
  button.setAttribute("aria-label", label);
  button.title = label;
}

function installThemeToggle(): void {
  const button = requiredElement<HTMLButtonElement>("theme-toggle");
  let theme = getPreferredTheme();
  applyTheme(theme);
  updateThemeToggle(button, theme);

  button.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    saveTheme(theme);
    updateThemeToggle(button, theme);
  });
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    try {
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    } finally {
      textarea.remove();
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  }
}

function installCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".copy-button[data-copy-target]",
  )) {
    const targetId = button.dataset.copyTarget;
    if (!targetId) continue;

    const target = requiredElement<HTMLElement>(targetId);
    const label = button.querySelector("span");
    const defaultLabel = label?.textContent ?? "Copy";
    const defaultAriaLabel = button.getAttribute("aria-label") ?? defaultLabel;
    let resetTimer: number | undefined;

    button.addEventListener("click", async () => {
      window.clearTimeout(resetTimer);
      try {
        await copyText(target.textContent ?? "");
        if (label) label.textContent = "Copied";
        button.setAttribute("aria-label", `${defaultAriaLabel} — copied`);
        button.dataset.copied = "true";
      } catch {
        if (label) label.textContent = "Try again";
        button.setAttribute("aria-label", `${defaultAriaLabel} — copy failed`);
        button.dataset.copied = "false";
      }

      resetTimer = window.setTimeout(() => {
        if (label) label.textContent = defaultLabel;
        button.setAttribute("aria-label", defaultAriaLabel);
        delete button.dataset.copied;
      }, 2_000);
    });
  }
}

const sessionUrl = new URL("/session/", window.location.origin);
requiredElement<HTMLElement>("setup-command").textContent =
  `export PI_SHARE_VIEWER_URL="${sessionUrl.href}"\npi`;

installThemeToggle();
installCopyButtons();
