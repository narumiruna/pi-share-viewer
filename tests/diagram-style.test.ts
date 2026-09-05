// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import {
  decorateMermaidSvg,
  installDiagramFocus,
  setDiagramDisplayMode,
} from "../src/diagram-style.js";

function makeSvg(body: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const svg = document.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) throw new Error("SVG fixture failed");
  return svg;
}

describe("decorateMermaidSvg", () => {
  test("adds conservative semantic tones and edge markers to a flowchart", () => {
    const svg = makeSvg(`
      <g class="node default" id="render-flowchart-browser-0"><rect/><text>Browser</text></g>
      <g class="node default" id="render-flowchart-db-1"><path/><text>Database</text></g>
      <g class="node default" id="render-flowchart-gate-2"><polygon/><text>Approved?</text></g>
      <g class="node default" id="render-flowchart-other-3"><rect/><text>Other</text></g>
      <g class="edgePath"><path data-id="L_browser_db_0" class="flowchart-link"/></g>
    `);

    const result = decorateMermaidSvg(svg, "flowchart-v2");

    expect(result).toEqual({
      kind: "flowchart",
      nodeCount: 4,
      edgeCount: 1,
      polishSupported: true,
    });
    expect(svg.classList.contains("pi-mermaid-polished")).toBe(true);
    expect(svg.dataset.piDiagramKind).toBe("flowchart");
    expect(
      svg
        .querySelector("#render-flowchart-browser-0")
        ?.getAttribute("data-pi-tone"),
    ).toBe("cyan");
    expect(
      svg.querySelector("#render-flowchart-db-1")?.getAttribute("data-pi-tone"),
    ).toBe("violet");
    expect(
      svg
        .querySelector("#render-flowchart-gate-2")
        ?.getAttribute("data-pi-tone"),
    ).toBe("amber");
    expect(
      svg
        .querySelector("#render-flowchart-other-3")
        ?.getAttribute("data-pi-tone"),
    ).toBe("neutral");
    expect(
      svg.querySelector(".flowchart-link")?.getAttribute("data-pi-edge"),
    ).toBe("true");
  });

  test("preserves authored node styles and generated accessibility content", () => {
    const svg = makeSvg(`
      <title id="title">Styled flow</title>
      <desc id="description">Browser sends data to API</desc>
      <g class="node default custom" id="render-flowchart-browser-0">
        <rect style="fill:#f00 !important;stroke:#0f0 !important"/>
        <text>Browser</text>
      </g>
    `);
    svg.setAttribute("aria-labelledby", "title");
    svg.setAttribute("aria-describedby", "description");

    decorateMermaidSvg(svg, "flowchart-v2");

    const node = svg.querySelector("g.node");
    expect(node?.getAttribute("data-pi-authored-style")).toBe("true");
    expect(node?.getAttribute("data-pi-tone")).toBe("neutral");
    expect(svg.querySelector("title")?.textContent).toBe("Styled flow");
    expect(svg.querySelector("desc")?.textContent).toContain(
      "Browser sends data",
    );
    expect(svg.getAttribute("aria-labelledby")).toBe("title");
  });

  test("progressively enhances sequence diagrams without requiring groups", () => {
    const svg = makeSvg(`
      <rect class="actor actor-top" name="API service"/>
      <line class="messageLine0"/>
    `);

    expect(decorateMermaidSvg(svg, "sequence")).toEqual({
      kind: "sequence",
      nodeCount: 1,
      edgeCount: 1,
      polishSupported: true,
    });
    expect(svg.querySelector("rect.actor")?.getAttribute("data-pi-tone")).toBe(
      "emerald",
    );
  });

  test("leaves unsupported diagram kinds in original mode", () => {
    const svg = makeSvg('<g class="node"><rect/><text>User</text></g>');

    expect(decorateMermaidSvg(svg, "classDiagram")).toEqual({
      kind: "classDiagram",
      nodeCount: 0,
      edgeCount: 0,
      polishSupported: false,
    });
    expect(svg.classList.contains("pi-mermaid-polished")).toBe(false);
    expect(svg.dataset.piDisplayMode).toBe("original");
    expect(setDiagramDisplayMode(svg, "polished")).toBe("original");
  });

  test("does not confuse underscore IDs and skips ambiguous endpoints", () => {
    const svg = makeSvg(`${["B", "A", "B_C", "A_B", "C", "D"]
      .map(
        (id) =>
          `<g class="node" id="pi-flowchart-${id}-0"><rect/><text>${id}</text></g>`,
      )
      .join("")}
      <path class="flowchart-link" data-id="L_A_B_C_0"/>
      <path class="flowchart-link" data-id="L_A_B_D_1"/>
      <path class="flowchart-link" data-id="custom-edge"/>
    `);
    decorateMermaidSvg(svg, "flowchart-v2");
    const cleanup = installDiagramFocus(svg);
    svg
      .querySelector("#pi-flowchart-B-0")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(svg.querySelectorAll("[data-pi-related]")).toHaveLength(0);
    svg
      .querySelector("#pi-flowchart-A_B-0")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      svg
        .querySelector('[data-id="L_A_B_C_0"]')
        ?.hasAttribute("data-pi-related"),
    ).toBe(false);
    expect(
      svg
        .querySelector('[data-id="L_A_B_D_1"]')
        ?.getAttribute("data-pi-related"),
    ).toBe("true");
    expect(
      svg.querySelector("#pi-flowchart-D-0")?.getAttribute("data-pi-related"),
    ).toBe("true");
    expect(
      svg.querySelector("#pi-flowchart-B-0")?.hasAttribute("data-pi-related"),
    ).toBe(false);
    cleanup();
  });

  test("focuses a selected flowchart node and its related path", () => {
    const svg = makeSvg(`
      <g class="node default" id="render-flowchart-A-0"><rect/><text>A</text></g>
      <g class="node default" id="render-flowchart-B-1"><rect/><text>B</text></g>
      <g class="edgePath"><path data-id="L_A_B_0" class="flowchart-link"/></g>
    `);
    decorateMermaidSvg(svg, "flowchart-v2");
    const cleanup = installDiagramFocus(svg);
    const node = svg.querySelector<SVGElement>("#render-flowchart-A-0");
    node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(svg.classList.contains("pi-mermaid-focused")).toBe(true);
    expect(node?.dataset.piSelected).toBe("true");
    expect(svg.querySelector("path")?.getAttribute("data-pi-related")).toBe(
      "true",
    );
    expect(
      svg
        .querySelector("#render-flowchart-B-1")
        ?.getAttribute("data-pi-related"),
    ).toBe("true");
    cleanup();
  });
});
