const GIST_ID_PATTERN = /^[0-9a-f]{32}$/i;
const DIAGRAM_ID_PATTERN = /^[0-9a-f]{8}-diagram-(?:[1-9]|[1-4]\d|50)$/i;

export function isGistId(value: string): boolean {
  return GIST_ID_PATTERN.test(value);
}

export function isDiagramId(value: string): boolean {
  return DIAGRAM_ID_PATTERN.test(value);
}
