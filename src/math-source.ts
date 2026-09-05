import { Marked, type MarkedOptions, type Token } from "marked";

export interface MathSource {
  raw: string;
  text: string;
  display: boolean;
}

function escaped(source: string, index: number): boolean {
  let slashes = 0;
  while (index > 0 && source[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}

/** Read a complete formula before Markdown consumes TeX punctuation. */
export function readMath(source: string): MathSource | undefined {
  const open = ["$$", "\\[", "\\(", "$"].find((value) =>
    source.startsWith(value),
  );
  if (!open) return;
  const close = open === "\\[" ? "\\]" : open === "\\(" ? "\\)" : open;
  const display = open === "$$" || open === "\\[";
  if (open === "$" && /\s|\$/.test(source[1] ?? " ")) return;

  // Nested backslash delimiters are not TeX commands. Stop at the next
  // opener instead of repeatedly scanning an unclosed suffix (quadratic
  // work on messages containing thousands of unmatched delimiters).
  if (open.startsWith("\\")) {
    let next = source.indexOf(open, open.length);
    while (next !== -1 && escaped(source, next))
      next = source.indexOf(open, next + open.length);
    if (next !== -1) source = source.slice(0, next);
  }
  let end = source.indexOf(close, open.length);
  while (end !== -1) {
    if (escaped(source, end)) {
      // An escaped dollar can overlap the real closing pair: $$a\$$$.
      end = source.indexOf(close, end + 1);
      continue;
    }
    // A doubled dollar is never the end of a single-dollar formula.
    if (open === "$" && (source[end - 1] === "$" || source[end + 1] === "$"))
      return;
    const text = source.slice(open.length, end);
    if (
      !text.trim() ||
      (!display && /\n/.test(text)) ||
      /`|(?:^|\n)\s*~~~|<\/?[a-zA-Z][^>]*>|!?\[[^\]]*\]\(/.test(text) ||
      (open === "$" &&
        (/\s/.test(source[end - 1]) || /\d/.test(source[end + 1] ?? "")))
    )
      return;
    return { raw: source.slice(0, end + close.length), text, display };
  }
}

export function escapeMathText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );
}

export interface PiMarkdownParser {
  parse(source: string, options?: MarkedOptions): string;
  parseInline(source: string): string;
  defaults: MarkedOptions;
}

// HTML is literal text in Pi. Preserve its original rendering but never look
// for math inside tags, attributes, comments, or paired HTML elements.
function rawHtml(source: string): string | undefined {
  const comment = /^<!--[\s\S]*?(?:-->|$)/.exec(source);
  if (comment) return comment[0];
  const tag =
    /^<([a-zA-Z][\w:-]*)(?:\s(?:"[^"]*"|'[^']*'|[^<>"'])*)?\s*\/?>/.exec(
      source,
    );
  if (!tag) return;
  if (
    /\/>$/.test(tag[0]) ||
    /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(
      tag[1],
    )
  )
    return tag[0];
  // Raw-text/RCDATA bodies cannot nest elements. Apparent openers and
  // comments are text; only the first matching end tag terminates the body.
  if (
    /^(?:script|style|textarea|title|xmp|iframe|noembed|noframes)$/i.test(
      tag[1],
    )
  ) {
    const closing = new RegExp(`</${tag[1]}\\s*>`, "gi");
    closing.lastIndex = tag[0].length;
    return closing.exec(source) ? source.slice(0, closing.lastIndex) : source;
  }
  const closing = new RegExp(
    `<!--[\\s\\S]*?(?:-->|$)|<\\/?${tag[1]}(?:\\s(?:"[^"]*"|'[^']*'|[^<>"'])*)?\\s*\\/?>`,
    "gi",
  );
  closing.lastIndex = tag[0].length;
  let depth = 1;
  let match = closing.exec(source);
  while (match) {
    // The matcher returns either a comment or a tag. Avoid an unterminated
    // HTML-comment string literal: this bundle is embedded in a script tag.
    if (match[0][1] !== "!" && !match[0].endsWith("/>"))
      depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(0, closing.lastIndex);
    match = closing.exec(source);
  }
  // An unclosed raw HTML element conservatively excludes the rest of the
  // current inline block; it must not change the upstream parser's output.
  return source;
}

/** Per-call extensions: never mutate Pi's global marked configuration. */
export function createMathParser(
  upstream: PiMarkdownParser,
): (text: string) => string {
  const extensions = new Marked({
    extensions: [
      {
        name: "piMathHtml",
        level: "inline",
        tokenizer(src) {
          const raw = rawHtml(src);
          if (!raw) return;
          // Keep the outer reference definitions and inline state, but do not
          // enhance math inside this literal. Options belong to this parse;
          // restoring them also keeps following formulas enhanced.
          const options = this.lexer.options;
          const extensions = options.extensions;
          try {
            options.extensions = null;
            return {
              type: "piMathHtml",
              raw,
              tokens: this.lexer.inlineTokens(raw),
            };
          } finally {
            options.extensions = extensions;
          }
        },
        renderer(token) {
          return this.parser.parseInline(token.tokens as Token[]);
        },
      },
      {
        name: "piMathBlock",
        level: "block",
        start: (src) => src.search(/^(?: {0,3})(?:\$\$|\\\[)/m),
        tokenizer(src) {
          const indent = /^ {0,3}/.exec(src)?.[0] ?? "";
          const math = readMath(src.slice(indent.length));
          if (
            !math?.display ||
            !/^(?:[ \t]*(?:\n|$))/.test(
              src.slice(indent.length + math.raw.length),
            )
          )
            return;
          return { type: "piMathBlock", ...math, raw: indent + math.raw };
        },
        renderer: (token) => placeholder(token),
      },
      {
        name: "piMathInline",
        level: "inline",
        start: (src) => src.search(/\$|\\[([]/),
        tokenizer(src) {
          const math = readMath(src);
          return math ? { type: "piMathInline", ...math } : undefined;
        },
        renderer: (token) => placeholder(token),
      },
    ],
  }).defaults.extensions;

  return (text) => {
    // Unknown upstream extensions may own these tokens. Fail closed rather
    // than silently replacing them or disabling Pi's URL/code renderers.
    if (upstream.defaults.extensions) return upstream.parse(text);
    try {
      return upstream.parse(text, { extensions });
    } catch {
      // A future incompatible marked runtime must not blank the session.
      return upstream.parse(text);
    }
  };
}

function placeholder(token: Token): string {
  return `<span class="pi-math" data-pi-math-display="${"display" in token && token.display === true}">${escapeMathText(token.raw)}</span>`;
}
