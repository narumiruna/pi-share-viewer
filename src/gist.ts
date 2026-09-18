export const SESSION_FILENAME = "session.html";
export const MAX_SESSION_HTML_BYTES = 12 * 1024 * 1024;
const MAX_GIST_API_BYTES = 16 * 1024 * 1024;
const GIST_API_ORIGIN = "https://api.github.com";
const RAW_GIST_HOST = "gist.githubusercontent.com";

export class GistLoadError extends Error {}

export interface SessionLoadProgress {
  loadedBytes: number;
  totalBytes?: number;
}

interface SessionLoadOptions {
  fetch?: typeof fetch;
  onProgress?: (progress: SessionLoadProgress) => void;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
  onProgress?: (progress: SessionLoadProgress) => void,
  fallbackTotalBytes?: number,
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  const parsedContentLength =
    contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  const contentLength =
    parsedContentLength !== undefined &&
    Number.isFinite(parsedContentLength) &&
    parsedContentLength >= 0
      ? parsedContentLength
      : undefined;
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new GistLoadError("Session is too large to display safely.");
  }
  const totalBytes = fallbackTotalBytes ?? contentLength;
  const reportProgress = (loadedBytes: number) =>
    onProgress?.({
      loadedBytes,
      ...(totalBytes !== undefined ? { totalBytes } : {}),
    });
  reportProgress(0);

  if (!response.body) {
    const text = await response.text();
    const loadedBytes = new Blob([text]).size;
    if (loadedBytes > maxBytes) {
      throw new GistLoadError("Session is too large to display safely.");
    }
    reportProgress(loadedBytes);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let loadedBytes = 0;
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loadedBytes += value.byteLength;
      if (loadedBytes > maxBytes) {
        await reader.cancel();
        throw new GistLoadError("Session is too large to display safely.");
      }
      output += decoder.decode(value, { stream: true });
      reportProgress(loadedBytes);
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function assertRawGistUrl(value: unknown, gistId: string): URL {
  if (typeof value !== "string") {
    throw new GistLoadError("GitHub did not provide the session content URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GistLoadError("GitHub returned an invalid session content URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== RAW_GIST_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.pathname.includes(`/${gistId}/`) ||
    !url.pathname.endsWith(`/${SESSION_FILENAME}`)
  ) {
    throw new GistLoadError(
      "GitHub returned an unexpected session content URL.",
    );
  }
  return url;
}

function explainHttpError(response: Response): GistLoadError {
  if (response.status === 404) {
    return new GistLoadError("Session not found. It may have been deleted.");
  }
  if (response.status === 403 || response.status === 429) {
    return new GistLoadError("GitHub rate limit reached. Try again later.");
  }
  return new GistLoadError(`GitHub request failed (${response.status}).`);
}

function assertResponseHost(response: Response, expectedHost: string): void {
  if (!response.url) return;
  try {
    const url = new URL(response.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== expectedHost ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new Error("unexpected URL");
    }
  } catch {
    throw new GistLoadError("GitHub redirected to an unexpected host.");
  }
}

async function request(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(input, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new GistLoadError("Unable to reach GitHub. Check your connection.");
  }
}

export async function loadSessionHtml(
  gistId: string,
  options: SessionLoadOptions = {},
): Promise<string> {
  if (!/^[0-9a-f]{32}$/i.test(gistId)) {
    throw new GistLoadError("Invalid Gist ID.");
  }

  const fetcher = options.fetch ?? fetch;
  const apiUrl = `${GIST_API_ORIGIN}/gists/${gistId.toLowerCase()}`;
  const response = await request(fetcher, apiUrl, {
    headers: { Accept: "application/vnd.github+json" },
    signal: options.signal,
  });

  assertResponseHost(response, "api.github.com");
  if (!response.ok) throw explainHttpError(response);
  const contentType = response.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("json")) {
    throw new GistLoadError("GitHub returned unexpected session metadata.");
  }

  const payloadText = await readTextWithLimit(response, MAX_GIST_API_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }
  if (!isRecord(parsed)) {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }
  const files = parsed.files;
  if (files === undefined) {
    throw new GistLoadError(`Gist does not contain ${SESSION_FILENAME}.`);
  }
  if (!isRecord(files)) {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }

  const file = files[SESSION_FILENAME];
  if (file === undefined) {
    throw new GistLoadError(`Gist does not contain ${SESSION_FILENAME}.`);
  }
  if (!isRecord(file)) {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }
  if (file.type !== undefined && file.type !== "text/html") {
    throw new GistLoadError(`${SESSION_FILENAME} is not an HTML file.`);
  }
  if (
    file.size !== undefined &&
    (typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0)
  ) {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }
  if (typeof file.size === "number" && file.size > MAX_SESSION_HTML_BYTES) {
    throw new GistLoadError("Session is too large to display safely.");
  }
  if (file.truncated !== undefined && typeof file.truncated !== "boolean") {
    throw new GistLoadError("GitHub returned malformed session metadata.");
  }

  if (file.truncated === true) {
    const rawUrl = assertRawGistUrl(file.raw_url, gistId.toLowerCase());
    const rawResponse = await request(fetcher, rawUrl, {
      signal: options.signal,
    });
    assertResponseHost(rawResponse, RAW_GIST_HOST);
    if (rawResponse.url)
      assertRawGistUrl(rawResponse.url, gistId.toLowerCase());
    if (!rawResponse.ok) throw explainHttpError(rawResponse);
    return readTextWithLimit(
      rawResponse,
      MAX_SESSION_HTML_BYTES,
      options.onProgress,
      typeof file.size === "number" ? file.size : undefined,
    );
  }

  if (typeof file.content !== "string") {
    throw new GistLoadError("GitHub did not return the session content.");
  }
  if (new Blob([file.content]).size > MAX_SESSION_HTML_BYTES) {
    throw new GistLoadError("Session is too large to display safely.");
  }
  return file.content;
}
