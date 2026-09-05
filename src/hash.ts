const GIST_ID_PATTERN = /^[0-9a-f]{32}$/i;
const ENTRY_ID_PATTERN = /^[0-9a-f]{8}$/i;
const DIAGRAM_ID_PATTERN = /^[0-9a-f]{8}-diagram-(?:[1-9]|[1-4]\d|50)$/i;
const PI_DEEP_LINK_KEYS = ["leafId", "targetId"] as const;
const DEEP_LINK_KEYS = [...PI_DEEP_LINK_KEYS, "diagramId"] as const;

export interface SessionHash {
  diagramId?: string;
  gistId: string;
  urlParams: string;
}

function invalidSessionUrl(): Error {
  return new Error(
    "Invalid session URL. Expected /session/#<32-character-gist-id> with optional Pi or diagram deep-link parameters.",
  );
}

export function parseSessionHash(hash: string): SessionHash {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const separator = value.indexOf("&");
  const gistId = separator === -1 ? value : value.slice(0, separator);
  if (!GIST_ID_PATTERN.test(gistId)) throw invalidSessionUrl();

  const source = separator === -1 ? "" : value.slice(separator + 1);
  const parsed = new URLSearchParams(source);
  const canonical = new URLSearchParams();
  const seen = new Set<string>();
  let diagramId: string | undefined;

  if (source && [...parsed].length === 0) throw invalidSessionUrl();
  for (const [key, rawValue] of parsed) {
    if (
      !DEEP_LINK_KEYS.includes(key as (typeof DEEP_LINK_KEYS)[number]) ||
      seen.has(key)
    ) {
      throw invalidSessionUrl();
    }
    seen.add(key);
    if (key === "diagramId") {
      if (!DIAGRAM_ID_PATTERN.test(rawValue)) throw invalidSessionUrl();
      diagramId = rawValue.toLowerCase();
    } else if (!ENTRY_ID_PATTERN.test(rawValue)) {
      throw invalidSessionUrl();
    }
  }
  for (const key of PI_DEEP_LINK_KEYS) {
    const entryId = parsed.get(key);
    if (entryId) canonical.set(key, entryId.toLowerCase());
  }

  return {
    ...(diagramId ? { diagramId } : {}),
    gistId: gistId.toLowerCase(),
    urlParams: canonical.toString(),
  };
}

export function parseGistId(hash: string): string {
  return parseSessionHash(hash).gistId;
}
