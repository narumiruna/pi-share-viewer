function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element as T;
}

const sessionUrl = new URL("/session/", window.location.origin);
requiredElement<HTMLElement>("preview-origin").textContent =
  `${sessionUrl.host}${sessionUrl.pathname}`;
requiredElement<HTMLElement>("setup-command").textContent =
  `export PI_SHARE_VIEWER_URL="${sessionUrl.href}"\npi`;
