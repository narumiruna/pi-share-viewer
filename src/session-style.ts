import {
  amber,
  amberDark,
  cyan,
  cyanDark,
  green,
  greenDark,
  red,
  redDark,
  slate,
  slateDark,
  teal,
  tealDark,
  violet,
  violetDark,
} from "@radix-ui/colors";

const SESSION_STYLE = `
:root[data-pi-session-skin="radix"] {
  color-scheme: dark;
  --body-bg: ${slateDark.slate1};
  --container-bg: ${slateDark.slate2};
  --info-bg: ${slateDark.slate3};
  --selectedBg: ${slateDark.slate4};
  --searchMatchBg: ${slateDark.slate5};
  --searchMatchText: ${slateDark.slate12};
  --accent: ${tealDark.teal11};
  --border: ${slateDark.slate7};
  --borderAccent: ${cyanDark.cyan11};
  --borderMuted: ${slateDark.slate6};
  --success: ${greenDark.green11};
  --error: ${redDark.red11};
  --warning: ${amberDark.amber11};
  --muted: ${slateDark.slate11};
  --dim: ${slateDark.slate9};
  --text: ${slateDark.slate12};
  --thinkingText: ${slateDark.slate11};
  --scrollbarTrack: transparent;
  --scrollbarThumb: ${slateDark.slate7};
  --userMessageBg: color-mix(in srgb, ${slateDark.slate2} 82%, ${tealDark.teal3});
  --userMessageText: ${slateDark.slate12};
  --customMessageBg: ${violetDark.violet2};
  --customMessageText: ${slateDark.slate12};
  --customMessageLabel: ${violetDark.violet11};
  --toolPendingBg: ${slateDark.slate3};
  --toolSuccessBg: ${greenDark.green2};
  --toolErrorBg: ${redDark.red2};
  --toolTitle: ${slateDark.slate12};
  --toolOutput: ${slateDark.slate11};
  --mdHeading: ${slateDark.slate12};
  --mdLink: ${cyanDark.cyan11};
  --mdCode: ${tealDark.teal11};
  --mdCodeBlock: ${greenDark.green11};
  --mdCodeBlockBorder: ${slateDark.slate6};
  --mdQuote: ${slateDark.slate11};
  --mdQuoteBorder: ${tealDark.teal9};
  --mdHr: ${slateDark.slate6};
  --mdListBullet: ${tealDark.teal11};
  font-synthesis: none;
}
:root[data-pi-session-skin="radix"][data-pi-mermaid-theme="light"] {
  color-scheme: light;
  --body-bg: ${slate.slate2};
  --container-bg: ${slate.slate1};
  --info-bg: ${slate.slate3};
  --selectedBg: ${slate.slate4};
  --searchMatchBg: ${slate.slate5};
  --searchMatchText: ${slate.slate12};
  --accent: ${teal.teal11};
  --border: ${slate.slate7};
  --borderAccent: ${cyan.cyan11};
  --borderMuted: ${slate.slate6};
  --success: ${green.green11};
  --error: ${red.red11};
  --warning: ${amber.amber11};
  --muted: ${slate.slate11};
  --dim: ${slate.slate9};
  --text: ${slate.slate12};
  --thinkingText: ${slate.slate11};
  --scrollbarThumb: ${slate.slate8};
  --userMessageBg: ${teal.teal2};
  --userMessageText: ${slate.slate12};
  --customMessageBg: ${violet.violet2};
  --customMessageText: ${slate.slate12};
  --customMessageLabel: ${violet.violet11};
  --toolPendingBg: ${slate.slate3};
  --toolSuccessBg: ${green.green2};
  --toolErrorBg: ${red.red2};
  --toolTitle: ${slate.slate12};
  --toolOutput: ${slate.slate11};
  --mdHeading: ${slate.slate12};
  --mdLink: ${cyan.cyan11};
  --mdCode: ${teal.teal11};
  --mdCodeBlock: ${green.green11};
  --mdCodeBlockBorder: ${slate.slate6};
  --mdQuote: ${slate.slate11};
  --mdQuoteBorder: ${teal.teal9};
  --mdHr: ${slate.slate6};
  --mdListBullet: ${teal.teal11};
}
[data-pi-session-skin="radix"] body {
  background: var(--body-bg);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
[data-pi-session-skin="radix"] :is(button, input):focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 74%, white);
  outline-offset: 2px;
}
[data-pi-session-skin="radix"] #sidebar {
  border-right-color: var(--borderMuted);
}
[data-pi-session-skin="radix"] :is(.header, .user-message, .assistant-message, .system-prompt, .tools-list) {
  border: 1px solid var(--borderMuted);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}
[data-pi-session-skin="radix"] :is(.header, .user-message, .assistant-message) {
  border-radius: 6px;
}
[data-pi-session-skin="radix"] :is(.system-prompt, .tools-list) {
  border-radius: 4px;
}
[data-pi-session-skin="radix"] :is(.filter-btn, .header-toggle-btn, .download-json-btn, .sidebar-close, .sidebar-search) {
  border-color: var(--borderMuted);
  border-radius: 4px;
}
[data-pi-session-skin="radix"] .filter-btn.active {
  border-color: var(--accent);
}
[data-pi-session-skin="radix"] .markdown-content {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.7;
}
[data-pi-session-skin="radix"] .markdown-content :is(code, pre) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
[data-pi-session-skin="radix"] .markdown-content :is(h1, h2, h3, h4, h5, h6) {
  line-height: 1.3;
}
[data-pi-session-skin="radix"] .markdown-content table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
[data-pi-session-skin="radix"] :is(*, *::before, *::after) {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbarThumb) transparent;
}
`;

export function installSessionStyle(): void {
  document.documentElement.dataset.piSessionSkin = "radix";
  if (document.querySelector('style[data-pi-session-style="radix"]')) return;
  const style = document.createElement("style");
  style.dataset.piSessionStyle = "radix";
  style.textContent = SESSION_STYLE;
  document.head.append(style);
}
