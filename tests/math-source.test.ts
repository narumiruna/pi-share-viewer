import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { Marked } from "marked";
import { describe, expect, test } from "vitest";
import { createMathParser, readMath } from "../src/math-source.js";

const exportedMarked = runInNewContext(
  `${readFileSync("node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/vendor/marked.min.js", "utf8")}; marked`,
) as { Marked: typeof Marked };

function parserFixture(MarkedRuntime: typeof Marked) {
  const upstream = new MarkedRuntime<string, string>({
    breaks: true,
    tokenizer: { html: () => undefined, tag: () => undefined },
    renderer: { codespan: () => false },
  });
  const parse = createMathParser({
    parse: (text, options) =>
      upstream.parse(text, { ...options, async: false }),
    parseInline: (text) => upstream.parseInline(text, { async: false }),
    get defaults() {
      return upstream.defaults;
    },
  });
  return { upstream, parse };
}

describe.each([
  { name: "installed Marked", MarkedRuntime: Marked },
  { name: "Pi export Marked", MarkedRuntime: exportedMarked.Marked },
])("pre-Markdown math recognition ($name)", ({ MarkedRuntime }) => {
  const fixture = () => parserFixture(MarkedRuntime);
  const count = (source: string) =>
    (
      fixture()
        .parse(source)
        .match(/class="pi-math"/g) ?? []
    ).length;
  test.each([
    ["$x_i$", false],
    [String.raw`\(x_{i_j}\)`, false],
    ["$$x^2$$", true],
    [String.raw`\[\frac{a}{b}\]`, true],
    [
      String.raw`$$
\begin{aligned}
a &= b \\
c &= d
\end{aligned}
$$`,
      true,
    ],
  ])("protects %s", (source, display) => {
    expect(readMath(source)).toMatchObject({ raw: source, display });
    expect(count(source)).toBe(1);
  });

  test.each([
    "$5 and $10",
    "\\$5 and \\$10",
    "$ x$",
    "$x $",
    "$x$2",
    "$unclosed",
    "$$unclosed",
    "`$x$`",
    "```latex\n$x$\n```",
    "    $x$",
    "~~~tex\n$x$\n~~~",
    "[label](https://example.com/$x$)",
    "![alt $x$](https://example.com/$x$)",
    "<https://example.com/$x$>",
    "https://example.com/$x$",
    '<span title="$x$">$x$</span>',
    "<span><span>$x$</span>$x$</span>",
    "<!-- $x$ -->",
    "<div>\n$x$\n</div>",
    "<code>$x$</code>",
    '<img title="$x > y$">',
    '<span><span title="a > b">$x$</span>$y$</span>',
    "<span><!-- </span> -->$x$</span>",
    "<svg:text>$x$</svg:text>",
    "$before `code` after$",
    "$before <b>x</b> after$",
    "$before [x](url) after$",
    "$a\nb$",
    "$$$",
    "$x$$",
  ])("does not convert excluded or ambiguous input: %s", (source) => {
    expect(count(source)).toBe(0);
  });

  test.each([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ])("excludes only the tag for void element %s", (tag) => {
    const { parse, upstream } = fixture();
    for (const name of [tag, tag.toUpperCase()]) {
      const literal = `<${name} title="$attribute$">`;
      expect(parse(literal)).toBe(upstream.parse(literal));
      expect(count(`${literal} then $x$`)).toBe(1);
    }
  });

  test("recognizes overlapping display closers after an escaped dollar", () => {
    const source = String.raw`$$a\$$$`;
    expect(readMath(`${source} trailing`)).toEqual({
      raw: source,
      text: String.raw`a\$`,
      display: true,
    });
    expect(count(source)).toBe(1);
    expect(count(`${source} then $z$`)).toBe(2);
    expect(readMath(String.raw`$$a\$$`)).toBeUndefined();
    expect(readMath(String.raw`$$a\\$$`)).toMatchObject({
      text: String.raw`a\\`,
    });
  });

  test.each([
    "<span>[docs][d] $literal$</span>",
    "<span>[d][] and [d] and ![image][d]</span>",
    "<span><span>**[docs][d]**</span></span>",
    "<span>[docs][d]", // Unclosed HTML also uses the baseline context.
    "<!-- [docs][d] $literal$ -->",
  ])("preserves reference definitions inside excluded HTML: %s", (literal) => {
    const { parse, upstream } = fixture();
    for (const source of [
      `${literal}\n\n[d]: https://example.com/docs "Docs"`,
      `[d]: https://example.com/docs "Docs"\n\n${literal}`,
    ]) {
      const baseline = upstream.parse(source);
      expect(baseline).toContain('href="https://example.com/docs"');
      expect(parse(source)).toBe(baseline);
      expect(parse(`${source}\n\nAfter $z$.`)).toContain('class="pi-math"');
    }
  });

  test.each([
    "$$unclosed",
    String.raw`\[unclosed`,
    "$$   $$",
    "$$x$$ trailing",
    String.raw`\[x\] trailing`,
    "    $$x$$",
  ])(
    "does not split paragraphs at rejected display blocks: %s",
    (candidate) => {
      const { parse, upstream } = fixture();
      const source = `before\n${candidate}`;
      // Replace only accepted formulas with a sentinel to compare paragraph
      // structure without conflating it with intentional math protection.
      const math = readMath(candidate.trimStart());
      const expected = upstream.parse(
        math ? source.replace(math.raw, "MATH") : source,
      );
      const output = parse(source).replace(
        /<span class="pi-math"[^>]*>.*?<\/span>/gs,
        "MATH",
      );
      expect(output).toBe(expected);
    },
  );

  test("finds a valid display block after rejected candidates", () => {
    const { parse } = fixture();
    expect(parse("before\n$$unclosed\n\n  $$x$$\nafter")).toContain(
      '</p>\n<span class="pi-math" data-pi-math-display="true">  $$x$$',
    );
  });

  test("bounds repeated unmatched delimiters without losing subsequent valid math", () => {
    expect(count(`${String.raw`\(x `.repeat(25_000)}then $z$`)).toBe(1);
    // Keep the bracket sample small: upstream marked's reference-link
    // masking is itself quadratic for repeated '[' even without our hook.
    expect(count(`${String.raw`\[x `.repeat(1_000)}then $z$`)).toBe(1);
  });

  test("does not alter excluded Markdown or global parsing options", () => {
    const { parse, upstream } = fixture();
    for (const text of [
      "<b>$x$</b>",
      "<!-- $x$ -->",
      "`$x$`",
      "[x](https://example.com/$x$)",
      "No math **bold**",
      String.raw`Escaped \$x\$`,
    ]) {
      expect(parse(text)).toBe(upstream.parse(text));
    }
    expect(parse("$x$")).toContain('class="pi-math"');
    expect(upstream.parse("$x$")).toBe("<p>$x$</p>\n");
    expect(upstream.defaults.extensions).toBeNull();
  });

  test("handles containers, repeated formulas and independent text parts", () => {
    const { parse } = fixture();
    const source = "- $x$ and $x$\n\n> \\(y\\)\n\n| A |\n| --- |\n| $z$ |";
    expect(parse(source).match(/class="pi-math"/g) ?? []).toHaveLength(4);
    expect(parse("$first")).not.toContain('class="pi-math"');
    expect(parse("second$")).not.toContain('class="pi-math"');
    expect(parse("$x$")).toBe(parse("$x$"));
  });

  test("keeps TeX punctuation before Markdown emphasis and escapes HTML", () => {
    const { parse } = fixture();
    const html = parse("$a *b* c$ and $x_{i_j}$ and $x < y & z$");
    expect(html).not.toContain("<em>");
    expect(html).toContain("$a *b* c$");
    expect(html).toContain("$x_{i_j}$");
    expect(html).toContain("$x &lt; y &amp; z$");
  });

  test("restores Pi's shared renderer after excluding raw HTML", () => {
    const { parse, upstream } = fixture();
    expect(
      parse("<span>$literal$ **bold**</span> then $x$ and $y$").match(
        /class="pi-math"/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(upstream.parse("$x$")).not.toContain('class="pi-math"');
  });

  test("falls back to upstream Markdown if a per-call extension is incompatible", () => {
    const parse = createMathParser({
      defaults: {},
      parse(text, options) {
        if (options?.extensions) throw new Error("incompatible");
        return text;
      },
      parseInline: (text) => text,
    });
    expect(parse("$x$")).toBe("$x$");
  });

  test("preserves existing upstream extensions instead of replacing them", () => {
    const { upstream, parse } = fixture();
    upstream.use({
      extensions: [
        { name: "other", level: "inline", tokenizer: () => undefined },
      ],
    });
    expect(parse("$x$")).toBe(upstream.parse("$x$"));
  });
});
