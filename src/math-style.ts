declare const __PI_KATEX_CSS__: string;

export function installMathStyle(): void {
  if (document.getElementById("pi-math-style")) return;
  const style = document.createElement("style");
  style.id = "pi-math-style";
  style.textContent = `${__PI_KATEX_CSS__}
[data-pi-session-ui="radix"] .pi-math { color: inherit; }
[data-pi-session-ui="radix"] .pi-math[data-pi-math-display="false"] {
  display: inline-grid; max-width: 100%; overflow-x: auto; overflow-y: hidden;
  vertical-align: baseline; padding-block: .15em;
}
[data-pi-session-ui="radix"] .pi-math[data-pi-math-display="true"] {
  display: block; max-width: 100%; overflow-x: auto; overflow-y: hidden;
  padding-block: .25rem; margin-block: .5rem;
}
[data-pi-session-ui="radix"] .pi-math .katex-display {
  margin: .5em 0; width: max-content; min-width: 100%;
}
[data-pi-session-ui="radix"] .pi-math[data-pi-math-state="error"],
[data-pi-session-ui="radix"] .pi-math[data-pi-math-state="limited"] {
  white-space: pre-wrap; overflow-wrap: anywhere;
}
[data-pi-session-ui="radix"] .pi-math-shell {
  position: relative; max-width: 100%; vertical-align: baseline;
}
[data-pi-session-ui="radix"] .pi-math-shell[data-pi-math-display="false"] {
  display: inline;
}
[data-pi-session-ui="radix"] .pi-math-shell[data-pi-math-display="true"] {
  display: block; width: 100%;
}
[data-pi-session-ui="radix"] .pi-math-controls { display: inline; }
[data-pi-session-ui="radix"] .pi-math-source-button {
  position: absolute; z-index: 3; top: -1.1rem;
  right: calc(var(--pi-math-control-index, 0) * 34px);
  min-width: 30px; min-height: 30px; border: 1px solid var(--borderMuted);
  border-radius: 4px; background: var(--container-bg); color: var(--accent);
  padding: 2px 5px; font: 700 11px/1 ui-monospace, monospace;
  cursor: pointer; opacity: 0;
}
[data-pi-session-ui="radix"] .pi-math-shell:is(:hover, :focus-within) .pi-math-source-button,
[data-pi-session-ui="radix"] .pi-math-source-button:focus-visible {
  opacity: 1;
}
[data-pi-session-ui="radix"] .pi-math-source-popover {
  display: grid; position: absolute; z-index: 4; top: 1.4rem;
  right: calc(var(--pi-math-control-index, 0) * 34px);
  width: min(22rem, calc(100vw - 2rem)); max-height: 16rem; gap: 8px;
  overflow: auto; border: 1px solid var(--border); border-radius: 6px;
  background: var(--container-bg); color: var(--text); padding: 10px;
  box-shadow: 0 12px 30px rgb(0 0 0 / 25%);
}
[data-pi-session-ui="radix"] .pi-math-source-popover[hidden] { display: none; }
[data-pi-session-ui="radix"] .pi-math-source-popover code {
  overflow-wrap: anywhere; white-space: pre-wrap;
}
[data-pi-session-ui="radix"] .pi-math-source-popover button {
  min-height: 36px; border: 1px solid var(--borderMuted); border-radius: 4px;
  background: var(--selectedBg); color: var(--text); padding: 5px 8px;
  cursor: pointer;
}
[data-pi-session-ui="radix"] .pi-math-action-status {
  min-height: 1.25rem; color: var(--accent); font-size: 11px;
  overflow-wrap: anywhere;
}
[data-pi-session-ui="radix"] .pi-math-shell[data-pi-math-overflow-right="true"]::after {
  content: ""; position: absolute; z-index: 1; top: 0; right: 0; bottom: 0;
  width: 2rem; background: linear-gradient(90deg, transparent, var(--container-bg));
  pointer-events: none;
}
[data-pi-session-ui="radix"] .pi-math-overflow-hint {
  position: absolute; z-index: 2; right: 4px; bottom: 2px;
  border: 1px solid var(--borderAccent); border-radius: 3px;
  background: color-mix(in srgb, var(--container-bg) 94%, transparent);
  color: var(--text); padding: 2px 5px; font: 700 10px/1.3 ui-monospace, monospace;
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%); pointer-events: none;
}
[data-pi-session-ui="radix"] .pi-math-overflow-hint[hidden] { display: none; }
@media (hover: none), (pointer: coarse) {
  [data-pi-session-ui="radix"] .pi-math-source-button {
    min-width: 44px; min-height: 44px; opacity: 1;
  }
}
`;
  document.head.append(style);
}
