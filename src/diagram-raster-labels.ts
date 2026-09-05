const SVG_NS = "http://www.w3.org/2000/svg";

/** Preserve browser line wrapping and inline formatting without Canvas-tainting HTML. */
export function replaceRasterLabels(
  source: SVGSVGElement,
  clone: SVGSVGElement,
): void {
  const originals = [...source.querySelectorAll("foreignObject")];
  const copies = [...clone.querySelectorAll("foreignObject")];
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    if (!copy) continue;
    const group = document.createElementNS(SVG_NS, "g");
    const matrix = original.getScreenCTM?.();
    if (!matrix || !original.getClientRects().length) {
      throw new Error("Show the diagram before exporting PNG labels.");
    }
    const inverse = matrix.inverse();
    const walker = document.createTreeWalker(original, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      let run: SVGTextElement | undefined;
      let lastY = Number.NaN;
      for (let offset = 0; offset < node.textContent.length; ) {
        const character = String.fromCodePoint(
          node.textContent.codePointAt(offset) ?? 0,
        );
        range.setStart(node, offset);
        offset += character.length;
        range.setEnd(node, offset);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const point = new DOMPoint(
          rect.left,
          rect.top + rect.height / 2,
        ).matrixTransform(inverse);
        if (!run || Math.abs(point.y - lastY) > 0.5) {
          run = document.createElementNS(SVG_NS, "text");
          run.setAttribute("x", String(point.x));
          run.setAttribute("y", String(point.y));
          run.setAttribute("dominant-baseline", "central");
          run.style.fontFamily = style.fontFamily;
          run.style.fontSize = style.fontSize;
          run.style.fontWeight = style.fontWeight;
          run.style.fontStyle = style.fontStyle;
          run.style.letterSpacing = style.letterSpacing;
          run.style.fill = style.color;
          run.style.stroke = "none";
          run.style.textAnchor = "start";
          run.style.whiteSpace = "pre";
          group.append(run);
          lastY = point.y;
        }
        run.textContent += character;
      }
    }
    // The measured coordinates already include the foreignObject's x/y offset.
    if (original.hasAttribute("transform")) {
      group.setAttribute("transform", original.getAttribute("transform") ?? "");
    }
    copy.replaceWith(group);
  }
}
