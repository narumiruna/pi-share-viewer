/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";
import { createDiagramView } from "../src/diagram-view.js";

function makeView(
  viewportWidth = 400,
  viewportHeight = 200,
  diagramWidth = 200,
  diagramHeight = 100,
): { stage: HTMLElement; viewport: HTMLElement } {
  document.body.innerHTML = `<div id="viewport" style="padding: 0"><div id="stage"><svg viewBox="0 0 ${diagramWidth} ${diagramHeight}"></svg></div></div>`;
  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const svg = stage?.querySelector("svg");
  if (!viewport || !stage || !(svg instanceof SVGSVGElement)) {
    throw new Error("Diagram fixture failed");
  }
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: viewportHeight },
    clientWidth: { configurable: true, value: viewportWidth },
  });
  viewport.getBoundingClientRect = () =>
    ({
      bottom: viewportHeight,
      height: viewportHeight,
      left: 0,
      right: viewportWidth,
      top: 0,
      width: viewportWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(svg, "viewBox", {
    configurable: true,
    value: {
      baseVal: { height: diagramHeight, width: diagramWidth, x: 0, y: 0 },
    },
  });
  return { stage, viewport };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diagram view", () => {
  test("keeps a small inline diagram at natural size and centers it", () => {
    const { stage, viewport } = makeView();
    const onScaleChange = vi.fn();
    const view = createDiagramView(viewport, stage, { onScaleChange });

    expect(view.getState()).toMatchObject({ scale: 1, x: 100, y: 50 });
    expect(stage.style.width).toBe("200px");
    expect(stage.style.height).toBe("100px");
    expect(onScaleChange).toHaveBeenLastCalledWith(100);
    view.destroy();
  });

  test("fits an oversized diagram without upscaling it", () => {
    const { stage, viewport } = makeView(400, 200, 800, 200);
    const view = createDiagramView(viewport, stage);

    expect(view.getState().scale).toBe(0.5);
    expect(view.getState().x).toBe(0);
    view.destroy();
  });

  test.each([
    [4_000, 1_000, 0.1],
    [1_000, 4_000, 0.05],
  ])(
    "fits a %s by %s diagram below the manual zoom floor",
    (width, height, scale) => {
      const { stage, viewport } = makeView(400, 200, width, height);
      const view = createDiagramView(viewport, stage);
      expect(view.getState().scale).toBe(scale);
      view.zoomBy(0.8);
      expect(view.getState().scale).toBe(scale);
      view.zoomBy(10);
      view.fit();
      expect(view.getState().scale).toBe(scale);
      Object.defineProperty(viewport, "clientWidth", { value: 200 });
      Object.defineProperty(viewport, "clientHeight", { value: 100 });
      view.refresh();
      expect(view.getState().scale).toBe(scale / 2);
      expect(
        view.getState().naturalWidth * view.getState().scale,
      ).toBeLessThanOrEqual(200);
      expect(
        view.getState().naturalHeight * view.getState().scale,
      ).toBeLessThanOrEqual(100);
      view.destroy();
    },
  );

  test("zooms around the requested client point", () => {
    const { stage, viewport } = makeView();
    const view = createDiagramView(viewport, stage);
    const before = view.getState();
    const worldX = (250 - before.x) / before.scale;

    view.zoomBy(3, { x: 250, y: 100 });

    const after = view.getState();
    expect(after.scale).toBe(3);
    expect(after.x + worldX * after.scale).toBeCloseTo(250);
    view.destroy();
  });

  test("leaves ordinary wheel scrolling alone and handles modified wheel zoom", () => {
    const { stage, viewport } = makeView();
    const view = createDiagramView(viewport, stage);
    const ordinary = new WheelEvent("wheel", {
      cancelable: true,
      clientX: 200,
      clientY: 100,
      deltaY: -1,
    });
    viewport.dispatchEvent(ordinary);
    expect(ordinary.defaultPrevented).toBe(false);
    expect(view.getState().scale).toBe(1);

    const zoom = new WheelEvent("wheel", {
      cancelable: true,
      clientX: 200,
      clientY: 100,
      ctrlKey: true,
      deltaY: -1,
    });
    viewport.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(view.getState().scale).toBeCloseTo(1.1);
    view.destroy();
  });

  test("supports keyboard zoom, fit, and escape", () => {
    const { stage, viewport } = makeView();
    const onEscape = vi.fn();
    const view = createDiagramView(viewport, stage, { onEscape });

    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(view.getState().scale).toBe(1.25);
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(view.getState().scale).toBe(1);
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).toHaveBeenCalledOnce();
    view.destroy();
  });
});
