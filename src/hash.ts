const GIST_ID_PATTERN = /^[0-9a-f]{32}$/i;
const ENTRY_ID_PATTERN = /^[0-9a-f]{8}$/i;
const DEEP_LINK_KEYS = ["leafId", "targetId"] as const;

export interface SessionHash {
  gistId: string;
  urlParams: string;
}

function invalidSessionUrl(): Error {
  return new Error(
    "Invalid session URL. Expected /session/#<32-character-gist-id> with optional Pi deep-link parameters.",
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

  if (source && [...parsed].length === 0) throw invalidSessionUrl();
  for (const [key, entryId] of parsed) {
    if (
      !DEEP_LINK_KEYS.includes(key as (typeof DEEP_LINK_KEYS)[number]) ||
      seen.has(key) ||
      !ENTRY_ID_PATTERN.test(entryId)
    ) {
      throw invalidSessionUrl();
    }
    seen.add(key);
  }
  for (const key of DEEP_LINK_KEYS) {
    const entryId = parsed.get(key);
    if (entryId) canonical.set(key, entryId.toLowerCase());
  }

  return { gistId: gistId.toLowerCase(), urlParams: canonical.toString() };
}

export function parseGistId(hash: string): string {
  return parseSessionHash(hash).gistId;
}
