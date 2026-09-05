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
`;
  document.head.append(style);
}
