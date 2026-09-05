const TONES = [
  "neutral",
  "cyan",
  "emerald",
  "violet",
  "amber",
  "rose",
  "orange",
] as const;

export type DiagramDisplayMode = "original" | "polished";
type Tone = (typeof TONES)[number];

const POLISHED_KINDS = new Set(["flowchart", "sequence", "state"]);
const NODE_SELECTOR = [
  "g.node",
  "g.actor",
  "g.classGroup",
  "g.stateGroup",
  "g.entityBox",
  "g.requirement",
  "rect.actor",
].join(",");
const EDGE_SELECTOR = [
  ".edgePath path",
  "path.flowchart-link",
  "path.messageLine0",
  "path.messageLine1",
  "line.messageLine0",
  "line.messageLine1",
  "path.relation",
  "path.transition",
].join(",");
const BUILT_IN_NODE_CLASSES = new Set([
  "actor",
  "actor-bottom",
  "actor-top",
  "classGroup",
  "default",
  "entityBox",
  "node",
  "requirement",
  "stateGroup",
  "statediagram-state",
]);
const SEMANTIC_TONES: Array<[RegExp, Tone]> = [
  [/(database|storage|store|cache|db|資料庫|儲存)/i, "violet"],
  [/(security|auth|policy|approval|gate|安全|授權|核准)/i, "rose"],
  [/(queue|event|message|bus|stream|佇列|事件|訊息)/i, "orange"],
  [/(api|service|server|backend|worker|服務|後端)/i, "emerald"],
  [/(user|client|browser|frontend|web|使用者|前端|瀏覽器)/i, "cyan"],
];

export interface DiagramDecoration {
  edgeCount: number;
  kind: string;
  nodeCount: number;
  polishSupported: boolean;
}

function hasAuthoredPresentation(node: Element): boolean {
  if (
    [...node.classList].some(
      (className) => !BUILT_IN_NODE_CLASSES.has(className),
    )
  ) {
    return true;
  }
  return [...node.querySelectorAll<HTMLElement>("[style]")].some((element) =>
    /(?:^|;)\s*(?:fill|stroke|color)\s*:/i.test(
      element.getAttribute("style") ?? "",
    ),
  );
}

function nodeTone(node: Element): Tone {
  if (hasAuthoredPresentation(node)) return "neutral";
  if (node.querySelector("polygon")) return "amber";

  const identity =
    `${node.getAttribute("name") ?? ""} ${node.textContent ?? ""}`.replace(
      /\s+/g,
      " ",
    );
  for (const [pattern, tone] of SEMANTIC_TONES) {
    if (pattern.test(identity)) return tone;
  }
  return "neutral";
}

export function normalizeDiagramKind(diagramType: string): string {
  if (/^(flowchart|graph)/.test(diagramType)) return "flowchart";
  if (diagramType.startsWith("sequence")) return "sequence";
  if (diagramType.startsWith("state")) return "state";
  return diagramType.replace(/-v\d+$/, "") || "diagram";
}

export function supportsDiagramPolish(kind: string): boolean {
  return POLISHED_KINDS.has(kind);
}

export function setDiagramDisplayMode(
  svg: SVGSVGElement,
  requestedMode: DiagramDisplayMode,
): DiagramDisplayMode {
  const mode =
    requestedMode === "polished" &&
    supportsDiagramPolish(svg.dataset.piDiagramKind ?? "")
      ? "polished"
      : "original";
  svg.classList.toggle("pi-mermaid-polished", mode === "polished");
  svg.dataset.piDisplayMode = mode;
  return mode;
}

export function decorateMermaidSvg(
  svg: SVGSVGElement,
  diagramType: string,
  requestedMode: DiagramDisplayMode = "polished",
): DiagramDecoration {
  const kind = normalizeDiagramKind(diagramType);
  const polishSupported = supportsDiagramPolish(kind);
  svg.dataset.piDiagramKind = kind;

  const nodes = polishSupported
    ? Array.from(svg.querySelectorAll<SVGElement>(NODE_SELECTOR))
    : [];
  for (const node of nodes) {
    node.dataset.piTone = nodeTone(node);
    node.dataset.piAuthoredStyle = hasAuthoredPresentation(node)
      ? "true"
      : "false";
  }

  const edges = polishSupported
    ? Array.from(svg.querySelectorAll<SVGElement>(EDGE_SELECTOR))
    : [];
  for (const edge of edges) edge.dataset.piEdge = "true";

  setDiagramDisplayMode(svg, requestedMode);
  return {
    kind,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    polishSupported,
  };
}

function flowchartNodeId(node: Element): string | undefined {
  const marker = "-flowchart-";
  const markerIndex = node.id.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return node.id.slice(markerIndex + marker.length).replace(/-\d+$/, "");
}

function flowchartEndpoints(
  edgeId: string,
  nodeIds: Set<string>,
): string[] | undefined {
  const encoded = /^L_(.+)_\d+$/.exec(edgeId)?.[1];
  if (!encoded) return undefined;
  let endpoints: string[] | undefined;
  for (const start of nodeIds) {
    if (!encoded.startsWith(`${start}_`)) continue;
    const end = encoded.slice(start.length + 1);
    if (!nodeIds.has(end)) continue;
    // Underscores are legal in both IDs. Never guess an ambiguous split.
    if (endpoints) return undefined;
    endpoints = [start, end];
  }
  return endpoints;
}

function clearFocus(svg: SVGSVGElement): void {
  svg.classList.remove("pi-mermaid-focused");
  for (const element of svg.querySelectorAll(
    "[data-pi-selected], [data-pi-related]",
  )) {
    element.removeAttribute("data-pi-selected");
    element.removeAttribute("data-pi-related");
  }
}

function focusFlowchartNode(svg: SVGSVGElement, selected: SVGElement): void {
  if (selected.dataset.piSelected === "true") {
    clearFocus(svg);
    return;
  }
  clearFocus(svg);
  const selectedId = flowchartNodeId(selected);
  if (!selectedId) return;
  svg.classList.add("pi-mermaid-focused");
  selected.dataset.piSelected = "true";

  const nodeIds = new Set(
    [...svg.querySelectorAll("g.node")]
      .map(flowchartNodeId)
      .filter((id): id is string => !!id),
  );
  const relatedIds = new Set([selectedId]);
  for (const edge of svg.querySelectorAll<SVGElement>("[data-pi-edge=true]")) {
    const endpoints = flowchartEndpoints(edge.dataset.id ?? "", nodeIds);
    if (!endpoints?.includes(selectedId)) continue;
    edge.dataset.piRelated = "true";
    for (const id of endpoints) relatedIds.add(id);
  }
  for (const node of svg.querySelectorAll<SVGElement>("g.node")) {
    const nodeId = flowchartNodeId(node);
    if (nodeId && relatedIds.has(nodeId) && node !== selected) {
      node.dataset.piRelated = "true";
    }
  }
}

export function installDiagramFocus(svg: SVGSVGElement): () => void {
  function selectable(target: EventTarget | null): SVGElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const node = target.closest<SVGElement>("g.node[data-pi-tone]");
    return node && svg.contains(node) ? node : undefined;
  }

  for (const node of svg.querySelectorAll<SVGElement>("g.node[data-pi-tone]")) {
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute(
      "aria-label",
      `Focus ${node.textContent?.trim() || "diagram node"}`,
    );
  }

  const onClick = (event: MouseEvent) => {
    const node = selectable(event.target);
    if (node && svg.dataset.piDiagramKind === "flowchart") {
      focusFlowchartNode(svg, node);
    } else if (event.target === svg) {
      clearFocus(svg);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = selectable(event.target);
    if (!node || svg.dataset.piDiagramKind !== "flowchart") return;
    event.preventDefault();
    focusFlowchartNode(svg, node);
  };
  svg.addEventListener("click", onClick);
  svg.addEventListener("keydown", onKeyDown);
  return () => {
    svg.removeEventListener("click", onClick);
    svg.removeEventListener("keydown", onKeyDown);
  };
}
