const GIST_ID_PATTERN = /^[0-9a-f]{32}$/i;

export function parseGistId(hash: string): string {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!GIST_ID_PATTERN.test(value)) {
    throw new Error(
      "Invalid session URL. Expected /session/#<32-character-gist-id>.",
    );
  }
  return value.toLowerCase();
}
