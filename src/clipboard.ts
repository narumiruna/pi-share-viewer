export interface ClipboardResult {
  method: "clipboard" | "fallback";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error || "Clipboard permission was denied.");
}

/** Write text without moving focus. The fallback is kept for non-secure hosts. */
export async function writeClipboard(text: string): Promise<ClipboardResult> {
  let clipboardError: unknown;
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return { method: "clipboard" };
    }
  } catch (error) {
    clipboardError = error;
  }

  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();

  try {
    if (document.execCommand("copy")) return { method: "fallback" };
  } catch (error) {
    if (!clipboardError) clipboardError = error;
  } finally {
    textarea.remove();
    if (previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
  }

  const detail = clipboardError
    ? `Clipboard unavailable: ${errorMessage(clipboardError)}`
    : "Clipboard unavailable: browser copy fallback failed.";
  throw new Error(detail);
}
