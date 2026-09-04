const TONES = ["cyan", "emerald", "violet", "amber", "rose", "orange"] as const;

type Tone = (typeof TONES)[number];

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

const SEMANTIC_TONES: Array<[RegExp, Tone]> = [
  [/(database|storage|store|cache|db|資料庫|儲存)/i, "violet"],
  [/(security|auth|policy|approval|gate|安全|授權|核准)/i, "rose"],
  [/(queue|event|message|bus|stream|佇列|事件|訊息)/i, "orange"],
  [/(api|service|server|backend|worker|服務|後端)/i, "emerald"],
  [/(user|client|browser|frontend|web|使用者|前端|瀏覽器)/i, "cyan"],
];

export interface DiagramDecoration {
  kind: string;
  nodeCount: number;
  edgeCount: number;
}

function stableIndex(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) | 0;
  }
  return Math.abs(hash) % TONES.length;
}

function nodeTone(node: Element): Tone {
  if (node.querySelector("polygon")) return "amber";

  const identity =
    `${node.id} ${node.getAttribute("name") ?? ""} ${node.textContent ?? ""}`.replace(
      /\s+/g,
      " ",
    );
  for (const [pattern, tone] of SEMANTIC_TONES) {
    if (pattern.test(identity)) return tone;
  }
  return TONES[stableIndex(identity)];
}

function normalizeKind(diagramType: string): string {
  if (/^(flowchart|graph)/.test(diagramType)) return "flowchart";
  if (diagramType.startsWith("sequence")) return "sequence";
  if (diagramType.startsWith("state")) return "state";
  return diagramType.replace(/-v\d+$/, "") || "diagram";
}

export function decorateMermaidSvg(
  svg: SVGSVGElement,
  diagramType: string,
): DiagramDecoration {
  const kind = normalizeKind(diagramType);
  svg.classList.add("pi-mermaid-polished");
  svg.dataset.piDiagramKind = kind;

  const nodes = Array.from(svg.querySelectorAll<SVGElement>(NODE_SELECTOR));
  for (const node of nodes) {
    node.dataset.piTone = nodeTone(node);
  }

  const edges = Array.from(svg.querySelectorAll<SVGElement>(EDGE_SELECTOR));
  for (const edge of edges) {
    edge.dataset.piEdge = "true";
  }

  return { kind, nodeCount: nodes.length, edgeCount: edges.length };
}
