/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSvgExport,
  downloadDiagramBlob,
  serializeDiagramSvg,
} from "../src/diagram-export.js";

function makeSvg(): SVGSVGElement {
  document.body.innerHTML = `
    <svg viewBox="0 0 200 100" role="graphics-document" aria-labelledby="title">
      <title id="title">Viewer flow</title>
      <script>globalThis.bad = true</script>
      <animate attributeName="href" values="#safe;https://example.com" />
      <a href="https://example.com"><text style="fill: rgb(1, 2, 3)">External</text></a>
      <image src="https://example.com/tracker.png" width="10" height="10" />
      <rect onclick="bad()" style="fill:url(https://example.com/pattern.svg)" width="10" height="10" />
    </svg>`;
  const svg = document.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) throw new Error("SVG fixture failed");
  return svg;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("diagram export", () => {
  test("serializes a self-contained, sanitized SVG with a background", () => {
    const output = serializeDiagramSvg(makeSvg(), {
      background: "#07101e",
      title: "Viewer flow",
    });

    expect(output).toContain('width="200"');
    expect(output).toContain('height="100"');
    expect(output).toContain('data-pi-export-background="true"');
    expect(output).toContain("Viewer flow");
    expect(output).not.toContain("<script");
    expect(output).not.toContain("<animate");
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("https://example.com");
  });

  test("replaces foreignObject labels in raster-safe output", () => {
    const svg = makeSvg();
    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "foreignObject",
    );
    label.setAttribute("width", "100");
    label.setAttribute("height", "20");
    label.innerHTML = '<div xmlns="http://www.w3.org/1999/xhtml">Label</div>';
    svg.append(label);

    const output = serializeDiagramSvg(
      svg,
      { background: "#fff", title: "Viewer flow" },
      true,
    );

    expect(output).not.toContain("foreignObject");
    expect(output).toContain(">Label</text>");
  });

  test("revokes temporary download URLs without retaining anchors", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:diagram");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    downloadDiagramBlob(new Blob(["diagram"]), "Viewer flow", "svg");
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="viewer-flow.svg"]')).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:diagram");
  });

  test("creates an SVG image blob", async () => {
    const blob = createSvgExport(makeSvg(), {
      background: "#fff",
      title: "Viewer flow",
    });

    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(blob.size).toBeGreaterThan(100);
    await expect(blob.text()).resolves.toContain("Viewer flow");
  });
});
