export function renderError(element: HTMLElement, error: unknown): void {
  element.textContent =
    error instanceof Error ? error.message : "Unable to load this session.";
}
