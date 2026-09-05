import { replaceRasterLabels } from "./diagram-raster-labels.js";

const MAX_EXPORT_DIMENSION = 8_192;
const MAX_EXPORT_PIXELS = 16_000_000;
const MAX_SERIALIZED_SVG_BYTES = 16 * 1024 * 1024;
const PRESENTATION_PROPERTIES = [
  "color",
  "fill",
  "fill-opacity",
  "filter",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
] as const;

export interface DiagramExportOptions {
  background: string;
  title: string;
}

function safeFilename(value: string, extension: string): string {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${name || "mermaid-diagram"}.${extension}`;
}

function naturalSize(svg: SVGSVGElement): {
  height: number;
  width: number;
  x: number;
  y: number;
} {
  const values = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = svg.viewBox?.baseVal.width || values[2] || 1;
  const height = svg.viewBox?.baseVal.height || values[3] || 1;
  const x = svg.viewBox?.baseVal.x ?? values[0] ?? 0;
  const y = svg.viewBox?.baseVal.y ?? values[1] ?? 0;
  return { height, width, x, y };
}

function copyPresentation(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const declarations: string[] = [];
  for (const property of PRESENTATION_PROPERTIES) {
    const value = computed.getPropertyValue(property).trim();
    if (!value || /url\s*\(/i.test(value)) continue;
    declarations.push(`${property}:${value}`);
  }
  if (declarations.length > 0)
    target.setAttribute("style", declarations.join(";"));
}

function isSafeReference(value: string): boolean {
  return (
    value.startsWith("#") ||
    /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(value)
  );
}

function hasUnsafeCssReference(value: string): boolean {
  for (const match of value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!isSafeReference(match[1].trim())) return true;
  }
  return false;
}

function sanitizeSvg(svg: SVGSVGElement): void {
  for (const blocked of svg.querySelectorAll(
    "script, style, iframe, object, embed, animate, animateMotion, animateTransform, set",
  )) {
    blocked.remove();
  }
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "href" || name === "src" || name.endsWith(":href")) {
        if (!isSafeReference(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (hasUnsafeCssReference(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

export function serializeDiagramSvg(
  source: SVGSVGElement,
  options: DiagramExportOptions,
  rasterSafe = false,
): string {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const sourceElements = [source, ...source.querySelectorAll("*")];
  const cloneElements = [clone, ...clone.querySelectorAll("*")];
  for (let index = 0; index < sourceElements.length; index += 1) {
    const sourceElement = sourceElements[index];
    const cloneElement = cloneElements[index];
    if (sourceElement && cloneElement)
      copyPresentation(sourceElement, cloneElement);
  }

  if (rasterSafe) replaceRasterLabels(source, clone);
  sanitizeSvg(clone);
  const { height, width, x, y } = naturalSize(source);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("transform");

  if (!clone.querySelector("title")) {
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );
    title.id = "pi-export-title";
    title.textContent = options.title;
    clone.prepend(title);
    clone.setAttribute("aria-labelledby", title.id);
  }

  const background = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  background.dataset.piExportBackground = "true";
  background.setAttribute("x", String(x));
  background.setAttribute("y", String(y));
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", options.background);
  clone.prepend(background);

  const output = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  if (new Blob([output]).size > MAX_SERIALIZED_SVG_BYTES) {
    throw new Error("Exported SVG is too large to process safely.");
  }
  return output;
}

export function createSvgExport(
  svg: SVGSVGElement,
  options: DiagramExportOptions,
): Blob {
  return new Blob([serializeDiagramSvg(svg, options)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

function svgDataUrl(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Unable to rasterize this diagram."));
    image.src = url;
  });
}

export async function createPngExport(
  svg: SVGSVGElement,
  options: DiagramExportOptions,
): Promise<Blob> {
  const sourceSize = naturalSize(svg);
  const desiredScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const dimensionScale = Math.min(
    desiredScale,
    MAX_EXPORT_DIMENSION / sourceSize.width,
    MAX_EXPORT_DIMENSION / sourceSize.height,
    Math.sqrt(MAX_EXPORT_PIXELS / (sourceSize.width * sourceSize.height)),
  );
  const width = Math.max(1, Math.round(sourceSize.width * dimensionScale));
  const height = Math.max(1, Math.round(sourceSize.height * dimensionScale));
  const rasterSource = serializeDiagramSvg(svg, options, true);
  const image = await loadImage(svgDataUrl(rasterSource));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is unavailable in this browser.");
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.size === 0)
      throw new Error("Unable to encode PNG export.");
    return blob;
  } finally {
    image.src = "";
  }
}

export function downloadDiagramBlob(
  blob: Blob,
  title: string,
  extension: "png" | "svg",
): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(title, extension);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
