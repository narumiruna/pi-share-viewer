const DIAGRAM_CSS = `
:root[data-pi-mermaid-theme="dark"] {
  --pi-diagram-panel: #07101e;
  --pi-diagram-panel-soft: rgb(15 23 42 / 96%);
  --pi-diagram-border: #29415f;
  --pi-diagram-text: #f5fbff;
  --pi-diagram-muted: #9eb0c7;
  --pi-diagram-edge: #7890ad;
  --pi-diagram-mask: #07101e;
}
:root[data-pi-mermaid-theme="light"] {
  --pi-diagram-panel: #f8fbfd;
  --pi-diagram-panel-soft: rgb(255 255 255 / 98%);
  --pi-diagram-border: #bfd5e2;
  --pi-diagram-text: #102638;
  --pi-diagram-muted: #587287;
  --pi-diagram-edge: #6f8fa4;
  --pi-diagram-mask: #fff;
}
.pi-mermaid-card, .pi-mermaid-error-card { position: relative; margin: 1rem 0; overflow: hidden; border: 1px solid var(--pi-diagram-border); border-radius: .4rem; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); }
.pi-mermaid-card:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.pi-mermaid-toolbar { display: flex; position: relative; flex-wrap: wrap; align-items: center; justify-content: space-between; min-height: 2.75rem; padding: .25rem .4rem; border-bottom: 1px solid var(--pi-diagram-border); background: var(--pi-diagram-panel); }
.pi-mermaid-toolbar-brand { color: var(--pi-diagram-muted); font: 500 .7rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: capitalize; }
.pi-mermaid-controls { display: flex; position: relative; flex-wrap: wrap; gap: .2rem; align-items: center; }
.pi-mermaid-control-group { display: flex; gap: .1rem; align-items: center; min-width: 0; margin: 0; border: 0; padding: 0; }
.pi-mermaid-group-label { width: 1px; height: 1rem; overflow: hidden; background: var(--pi-diagram-border); color: transparent; }
.pi-mermaid-toolbar button { display: inline-grid; width: 2rem; min-width: 2rem; height: 2rem; min-height: 2rem; place-items: center; border: 0; border-radius: .25rem; background: transparent; color: var(--pi-diagram-muted); padding: 0; cursor: pointer; }
.pi-mermaid-toolbar button svg { width: 1rem; height: 1rem; }
.pi-mermaid-toolbar button:hover { background: color-mix(in srgb, var(--pi-diagram-border) 35%, transparent); color: var(--pi-diagram-text); }
.pi-mermaid-toolbar button:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 1px; }
.pi-mermaid-toolbar button:disabled { opacity: .4; cursor: not-allowed; }
.pi-mermaid-toolbar .pi-mermaid-retry { width: auto; padding-inline: .45rem; font: 500 .65rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pi-mermaid-toolbar .pi-mermaid-retry[hidden] { display: none; }
.pi-mermaid-toolbar button[aria-pressed="true"], .pi-mermaid-toolbar button[data-state="on"] { background: color-mix(in srgb, #2dd4bf 12%, var(--pi-diagram-panel)); color: #2dd4bf; }
.pi-mermaid-zoom { min-width: 2.8rem; color: var(--pi-diagram-muted); text-align: center; font: 500 .65rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pi-mermaid-more { display: none !important; }
.pi-mermaid-secondary { display: contents; }
.pi-mermaid-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pi-mermaid-inline-status { max-width: 18rem; overflow: hidden; color: var(--pi-diagram-muted); font: 500 .65rem/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.pi-mermaid-tooltip { z-index: 2147483647; border: 1px solid var(--pi-diagram-border); border-radius: .25rem; background: var(--pi-diagram-panel-soft); color: var(--pi-diagram-text); padding: .35rem .45rem; font: 500 .7rem/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pi-mermaid-viewport { position: relative; min-height: 10rem; max-height: 75vh; overflow: hidden; padding: 1rem; background: var(--pi-diagram-panel); cursor: grab; touch-action: pan-y; }
.pi-mermaid-viewport:focus-visible { outline: 2px solid #2dd4bf; outline-offset: -3px; }
.pi-mermaid-viewport:active { cursor: grabbing; }
.pi-mermaid-stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
.pi-mermaid-stage > svg { display: block; width: 100% !important; max-width: none !important; height: 100% !important; overflow: visible; }
.pi-mermaid-polished { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
.pi-mermaid-polished [data-pi-tone="neutral"] { --pi-node-fill: color-mix(in srgb, var(--pi-diagram-border) 18%, var(--pi-diagram-panel)); --pi-node-stroke: var(--pi-diagram-border); }
.pi-mermaid-polished [data-pi-tone="cyan"] { --pi-node-fill: rgb(6 182 212 / 14%); --pi-node-stroke: #22d3ee; }
.pi-mermaid-polished [data-pi-tone="emerald"] { --pi-node-fill: rgb(16 185 129 / 14%); --pi-node-stroke: #34d399; }
.pi-mermaid-polished [data-pi-tone="violet"] { --pi-node-fill: rgb(139 92 246 / 16%); --pi-node-stroke: #a78bfa; }
.pi-mermaid-polished [data-pi-tone="amber"] { --pi-node-fill: rgb(245 158 11 / 14%); --pi-node-stroke: #fbbf24; }
.pi-mermaid-polished [data-pi-tone="rose"] { --pi-node-fill: rgb(244 63 94 / 14%); --pi-node-stroke: #fb7185; }
.pi-mermaid-polished [data-pi-tone="orange"] { --pi-node-fill: rgb(249 115 22 / 14%); --pi-node-stroke: #fb923c; }
:root[data-pi-mermaid-theme="light"] .pi-mermaid-polished [data-pi-tone]:not([data-pi-tone="neutral"]) { --pi-node-fill: color-mix(in srgb, var(--pi-node-stroke) 9%, white); }
.pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] > :is(rect, circle, ellipse, polygon, path), .pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] > g > :is(rect, circle, ellipse, polygon, path), .pi-mermaid-polished rect.actor[data-pi-authored-style="false"] { fill: var(--pi-node-fill) !important; stroke: var(--pi-node-stroke) !important; stroke-width: 1.5px !important; filter: drop-shadow(0 5px 8px rgb(0 0 0 / 12%)); }
.pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] rect, .pi-mermaid-polished rect.actor[data-pi-authored-style="false"] { rx: 8px; ry: 8px; }
.pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] text, .pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] span, .pi-mermaid-polished [data-pi-authored-style="false"][data-pi-tone] p, .pi-mermaid-polished text.actor { color: var(--pi-diagram-text) !important; fill: var(--pi-diagram-text) !important; font-weight: 600 !important; }
.pi-mermaid-polished [data-pi-edge="true"] { stroke: var(--pi-diagram-edge) !important; stroke-width: 1.45px !important; transition: opacity .15s ease, stroke .15s ease, stroke-width .15s ease; }
.pi-mermaid-polished [data-pi-edge="true"]:hover, .pi-mermaid-polished [data-pi-edge="true"][data-pi-related="true"] { stroke: #2dd4bf !important; stroke-width: 2.5px !important; }
.pi-mermaid-polished marker path { fill: var(--pi-diagram-edge) !important; stroke: var(--pi-diagram-edge) !important; }
.pi-mermaid-polished .edgeLabel rect, .pi-mermaid-polished .labelBkg { fill: var(--pi-diagram-mask) !important; opacity: .96 !important; }
.pi-mermaid-polished .edgeLabel :is(div, span, p) { background: var(--pi-diagram-mask) !important; }
.pi-mermaid-polished .edgeLabel, .pi-mermaid-polished .edgeLabel :is(p, span), .pi-mermaid-polished .messageText, .pi-mermaid-polished .loopText { color: var(--pi-diagram-muted) !important; fill: var(--pi-diagram-muted) !important; }
.pi-mermaid-polished .cluster rect, .pi-mermaid-polished rect.rect { fill: color-mix(in srgb, var(--pi-diagram-panel) 76%, transparent) !important; stroke: var(--pi-diagram-border) !important; stroke-dasharray: 5 4; }
.pi-mermaid-polished .cluster-label, .pi-mermaid-polished .labelText { color: var(--pi-diagram-muted) !important; fill: var(--pi-diagram-muted) !important; }
.pi-mermaid-polished .actor-line { stroke: var(--pi-diagram-border) !important; stroke-dasharray: 5 5; }
.pi-mermaid-polished .note { fill: color-mix(in srgb, #fbbf24 10%, var(--pi-diagram-panel)) !important; stroke: #d97706 !important; }
.pi-mermaid-polished g.node[data-pi-tone] { cursor: pointer; transition: opacity .15s ease; }
.pi-mermaid-polished g.node[data-pi-tone]:focus-visible { outline: none; }
.pi-mermaid-polished g.node[data-pi-tone]:focus-visible > :is(rect, circle, ellipse, polygon, path), .pi-mermaid-polished g.node[data-pi-selected="true"] > :is(rect, circle, ellipse, polygon, path) { stroke: #2dd4bf !important; stroke-width: 3px !important; }
.pi-mermaid-polished.pi-mermaid-focused g.node[data-pi-tone]:not([data-pi-selected="true"]):not([data-pi-related="true"]), .pi-mermaid-polished.pi-mermaid-focused [data-pi-edge="true"]:not([data-pi-related="true"]) { opacity: .24; }
.pi-mermaid-tracing .pi-mermaid-polished [data-pi-edge="true"] { stroke: #2dd4bf !important; stroke-dasharray: 9 7; animation: pi-mermaid-trace 1.1s linear infinite; }
@keyframes pi-mermaid-trace { to { stroke-dashoffset: -16; } }
.pi-mermaid-source { max-height: 60vh; margin: 0; overflow: auto; padding: 1rem; border: 0; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); white-space: pre; }
.pi-mermaid-source[hidden], .pi-mermaid-viewport[hidden] { display: none; }
.pi-mermaid-pending { display: grid; min-height: 8rem; place-items: center; padding: 1rem; color: var(--pi-diagram-muted); font: 500 .75rem/1.5 ui-monospace, monospace; }
.pi-mermaid-renderer-frame { position: fixed; z-index: -1; top: 0; left: 0; width: 1024px; height: 768px; border: 0; opacity: 0; pointer-events: none; }
.pi-mermaid-error { margin: 0; padding: 1rem; color: #ef4444; font: 500 .8rem/1.5 ui-monospace, monospace; }
.pi-mermaid-error summary { cursor: pointer; }
.pi-mermaid-error p { margin: 0 0 .5rem; }
.pi-mermaid-error button { border: 1px solid var(--pi-diagram-border); border-radius: .25rem; background: transparent; color: currentColor; padding: .35rem .55rem; cursor: pointer; }
.pi-mermaid-error-details { max-height: 12rem; overflow: auto; white-space: pre-wrap; }
.pi-session-theme-toggle { display: grid; position: fixed; z-index: 2147483646; top: 12px; right: 12px; width: 36px; height: 36px; place-items: center; border: 1px solid var(--borderMuted); border-radius: 4px; background: var(--container-bg); color: var(--text); padding: 0; font: 600 16px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.pi-session-theme-toggle:hover { background: var(--selectedBg); }
.pi-session-theme-toggle[aria-busy="true"] { opacity: .65; cursor: progress; }
.pi-session-theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pi-mermaid-card:fullscreen, .pi-mermaid-card.pi-mermaid-expanded { display: flex; position: fixed; inset: 0; z-index: 2147483647; width: 100vw; height: 100vh; margin: 0; border: 0; border-radius: 0; flex-direction: column; background: var(--pi-diagram-panel); color: var(--pi-diagram-text); }
.pi-mermaid-card:fullscreen .pi-mermaid-viewport, .pi-mermaid-card.pi-mermaid-expanded .pi-mermaid-viewport { max-height: none; height: auto; flex: 1; }
@media (prefers-reduced-motion: reduce) { .pi-mermaid-tracing .pi-mermaid-polished [data-pi-edge="true"] { animation: none; } }
@media (pointer: coarse) { .pi-mermaid-toolbar button { width: 2.75rem; min-width: 2.75rem; height: 2.75rem; min-height: 2.75rem; } }
@media (max-width: 640px) {
  .pi-mermaid-viewport { min-height: 10rem; padding: .5rem; }
  .pi-mermaid-toolbar { align-items: flex-start; }
  .pi-mermaid-controls { justify-content: flex-end; width: 100%; }
  .pi-mermaid-control-group { flex-wrap: wrap; max-width: 100%; }
  .pi-mermaid-toolbar button { width: 2.75rem; min-width: 2.75rem; height: 2.75rem; min-height: 2.75rem; }
  .pi-mermaid-group-label { display: none; }
  .pi-mermaid-more { display: inline-grid !important; }
  .pi-mermaid-secondary { display: none; order: 1; flex-basis: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; flex-wrap: wrap; gap: .35rem; margin-top: .35rem; border: 1px solid var(--pi-diagram-border); border-radius: .35rem; background: var(--pi-diagram-panel-soft); padding: .35rem; }
  .pi-mermaid-secondary.is-open { display: flex; }
}
`;

export function installDiagramCss(): void {
  if (document.querySelector("style[data-pi-diagram-style]")) return;
  const style = document.createElement("style");
  style.dataset.piDiagramStyle = "true";
  style.textContent = DIAGRAM_CSS;
  document.head.append(style);
}
