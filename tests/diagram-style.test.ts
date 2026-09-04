// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { decorateMermaidSvg } from "../src/diagram-style.js";

function makeSvg(body: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const svg = document.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) throw new Error("SVG fixture failed");
  return svg;
}

describe("decorateMermaidSvg", () => {
  test("adds stable semantic tones and edge markers to a flowchart", () => {
    const svg = makeSvg(`
      <g class="node" id="flowchart-browser-0"><rect/><text>Browser</text></g>
      <g class="node" id="flowchart-db-1"><path/><text>Database</text></g>
      <g class="node" id="flowchart-gate-2"><polygon/><text>Approved?</text></g>
      <g class="edgePath"><path class="flowchart-link"/></g>
    `);

    const result = decorateMermaidSvg(svg, "flowchart-v2");

    expect(result).toEqual({ kind: "flowchart", nodeCount: 3, edgeCount: 1 });
    expect(svg.classList.contains("pi-mermaid-polished")).toBe(true);
    expect(svg.dataset.piDiagramKind).toBe("flowchart");
    expect(
      svg.querySelector("#flowchart-browser-0")?.getAttribute("data-pi-tone"),
    ).toBe("cyan");
    expect(
      svg.querySelector("#flowchart-db-1")?.getAttribute("data-pi-tone"),
    ).toBe("violet");
    expect(
      svg.querySelector("#flowchart-gate-2")?.getAttribute("data-pi-tone"),
    ).toBe("amber");
    expect(
      svg.querySelector(".flowchart-link")?.getAttribute("data-pi-edge"),
    ).toBe("true");
  });

  test("progressively enhances sequence diagrams without requiring nodes", () => {
    const svg = makeSvg(`
      <rect class="actor actor-top" name="API service"/>
      <line class="messageLine0"/>
    `);

    expect(decorateMermaidSvg(svg, "sequence")).toEqual({
      kind: "sequence",
      nodeCount: 1,
      edgeCount: 1,
    });
    expect(svg.querySelector("rect.actor")?.getAttribute("data-pi-tone")).toBe(
      "emerald",
    );
  });
});
