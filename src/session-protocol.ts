import type { SiteTheme } from "./theme.js";

export const MAX_RUNTIME_SOURCE_BYTES = 8 * 1024 * 1024;
export const RUNTIME_KINDS = ["enhancer", "renderer"] as const;

export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

export interface RuntimeMessage {
  kind: RuntimeKind;
  loadId: string;
  source: string;
  type: "pi-share-viewer-runtime";
}

export interface ReadyMessage {
  loadId: string;
  type: "pi-share-viewer-ready";
}

export interface RuntimeActiveMessage {
  kind: RuntimeKind;
  loadId: string;
  type: "pi-share-viewer-runtime-active";
}

export interface RuntimeFailedMessage {
  kind: RuntimeKind;
  loadId: string;
  type: "pi-share-viewer-runtime-failed";
}

export interface ThemeMessage {
  theme: SiteTheme;
  type: "pi-share-viewer-theme";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isRuntimeKind(value: unknown): value is RuntimeKind {
  return RUNTIME_KINDS.includes(value as RuntimeKind);
}

export function createRuntimeMessage(
  loadId: string,
  kind: RuntimeKind,
  source: string,
): RuntimeMessage {
  return { type: "pi-share-viewer-runtime", loadId, kind, source };
}

export function createReadyMessage(loadId: string): ReadyMessage {
  return { type: "pi-share-viewer-ready", loadId };
}

export function createRuntimeActiveMessage(
  loadId: string,
  kind: RuntimeKind,
): RuntimeActiveMessage {
  return { type: "pi-share-viewer-runtime-active", loadId, kind };
}

export function createRuntimeFailedMessage(
  loadId: string,
  kind: RuntimeKind,
): RuntimeFailedMessage {
  return { type: "pi-share-viewer-runtime-failed", loadId, kind };
}

export function createThemeMessage(theme: SiteTheme): ThemeMessage {
  return { type: "pi-share-viewer-theme", theme };
}

export function isRuntimeMessage(
  value: unknown,
  loadId: string,
): value is RuntimeMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === "pi-share-viewer-runtime" &&
    value.loadId === loadId &&
    isRuntimeKind(value.kind) &&
    typeof value.source === "string" &&
    new Blob([value.source]).size <= MAX_RUNTIME_SOURCE_BYTES &&
    hasOnlyKeys(value, ["type", "loadId", "kind", "source"])
  );
}

export function isReadyMessage(
  value: unknown,
  loadId: string,
): value is ReadyMessage {
  return (
    isRecord(value) &&
    value.type === "pi-share-viewer-ready" &&
    value.loadId === loadId &&
    hasOnlyKeys(value, ["type", "loadId"])
  );
}

function isRuntimeStatusMessage(
  value: unknown,
  loadId: string,
  type: RuntimeActiveMessage["type"] | RuntimeFailedMessage["type"],
): value is RuntimeActiveMessage | RuntimeFailedMessage {
  return (
    isRecord(value) &&
    value.type === type &&
    value.loadId === loadId &&
    isRuntimeKind(value.kind) &&
    hasOnlyKeys(value, ["type", "loadId", "kind"])
  );
}

export function isRuntimeActiveMessage(
  value: unknown,
  loadId: string,
): value is RuntimeActiveMessage {
  return isRuntimeStatusMessage(
    value,
    loadId,
    "pi-share-viewer-runtime-active",
  );
}

export function isRuntimeFailedMessage(
  value: unknown,
  loadId: string,
): value is RuntimeFailedMessage {
  return isRuntimeStatusMessage(
    value,
    loadId,
    "pi-share-viewer-runtime-failed",
  );
}

export function isThemeMessage(value: unknown): value is ThemeMessage {
  return (
    isRecord(value) &&
    value.type === "pi-share-viewer-theme" &&
    (value.theme === "dark" || value.theme === "light")
  );
}
