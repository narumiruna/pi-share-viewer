export type SiteTheme = "dark" | "light";

const THEME_STORAGE_KEY = "pi-share-viewer-theme";

function parseColor(value: string): [number, number, number] | undefined {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (!hex) return undefined;
  return [
    Number.parseInt(hex[1].slice(0, 2), 16),
    Number.parseInt(hex[1].slice(2, 4), 16),
    Number.parseInt(hex[1].slice(4, 6), 16),
  ];
}

export function isDarkColor(value: string): boolean {
  const color = parseColor(value);
  if (!color) return true;
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5;
}

export function getSavedTheme(): SiteTheme | undefined {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
  return undefined;
}

export function getPreferredTheme(): SiteTheme {
  const savedTheme = getSavedTheme();
  if (savedTheme) return savedTheme;

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyTheme(theme: SiteTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: SiteTheme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The visible theme still works when persistence is unavailable.
  }
}
