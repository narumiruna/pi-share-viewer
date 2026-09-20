export function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}
