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
:root[data-pi-session-ui="radix"] {
  color-scheme: dark;
  --body-bg: ${slateDark.slate1};
  --container-bg: ${slateDark.slate2};
  --selectedBg: ${slateDark.slate3};
  --accent: ${tealDark.teal11};
  --border: ${slateDark.slate7};
  --borderAccent: ${cyanDark.cyan11};
  --borderMuted: ${slateDark.slate5};
  --success: ${greenDark.green11};
  --error: ${redDark.red11};
  --warning: ${amberDark.amber11};
  --muted: ${slateDark.slate11};
  --dim: ${slateDark.slate9};
  --text: ${slateDark.slate12};
  --thinkingText: ${slateDark.slate11};
  --scrollbarTrack: transparent;
  --scrollbarThumb: ${slateDark.slate7};
  --userMessageBg: color-mix(in srgb, ${slateDark.slate2} 92%, ${tealDark.teal2});
  --userMessageText: ${slateDark.slate12};
  --customMessageBg: ${violetDark.violet2};
  --toolPendingBg: ${slateDark.slate3};
  --toolSuccessBg: ${greenDark.green2};
  --toolErrorBg: ${redDark.red2};
  --toolOutput: ${slateDark.slate11};
  --mdHeading: ${slateDark.slate12};
  --mdLink: ${cyanDark.cyan11};
  --mdCode: ${tealDark.teal11};
  --mdCodeBlockBorder: ${slateDark.slate6};
  --mdQuote: ${slateDark.slate11};
  --mdQuoteBorder: ${tealDark.teal9};
  --mdHr: ${slateDark.slate5};
  --line-height: 1.65rem;
  --sidebar-width: 320px;
  --sidebar-min-width: 260px;
  --sidebar-max-width: 560px;
  font-synthesis: none;
}
:root[data-pi-session-ui="radix"][data-pi-mermaid-theme="light"] {
  color-scheme: light;
  --body-bg: ${slate.slate2};
  --container-bg: ${slate.slate1};
  --selectedBg: ${slate.slate3};
  --accent: ${teal.teal11};
  --border: ${slate.slate7};
  --borderAccent: ${cyan.cyan11};
  --borderMuted: ${slate.slate5};
  --success: ${green.green11};
  --error: ${red.red11};
  --warning: ${amber.amber11};
  --muted: ${slate.slate11};
  --dim: ${slate.slate9};
  --text: ${slate.slate12};
  --thinkingText: ${slate.slate11};
  --scrollbarThumb: ${slate.slate8};
  --userMessageBg: ${slate.slate1};
  --userMessageText: ${slate.slate12};
  --customMessageBg: ${violet.violet2};
  --toolPendingBg: ${slate.slate3};
  --toolSuccessBg: ${green.green2};
  --toolErrorBg: ${red.red2};
  --toolOutput: ${slate.slate11};
  --mdHeading: ${slate.slate12};
  --mdLink: ${cyan.cyan11};
  --mdCode: ${teal.teal11};
  --mdCodeBlockBorder: ${slate.slate6};
  --mdQuote: ${slate.slate11};
  --mdQuoteBorder: ${teal.teal9};
  --mdHr: ${slate.slate5};
}
[data-pi-session-ui="radix"] body {
  min-width: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.65;
  letter-spacing: -.005em;
  background:
    radial-gradient(circle at 56% -10%, rgb(45 212 191 / 7%), transparent 34rem),
    var(--body-bg);
}
[data-pi-session-ui="radix"] :is(code, pre, .tree-container, .tool-output) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
[data-pi-session-ui="radix"] :is(button, input) {
  font: inherit;
}
[data-pi-session-ui="radix"] :is(button, input):focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 74%, white);
  outline-offset: 2px;
}
[data-pi-session-ui="radix"] #app {
  min-width: 0;
  background: transparent;
}
[data-pi-session-ui="radix"] #sidebar {
  border-right: 1px solid var(--borderMuted);
  background: color-mix(in srgb, var(--container-bg) 94%, transparent);
  box-shadow: 12px 0 40px rgb(0 0 0 / 12%);
}
[data-pi-session-ui="radix"] .sidebar-header {
  z-index: 2;
  padding: 14px;
  border-bottom: 1px solid var(--borderMuted);
  background: color-mix(in srgb, var(--container-bg) 90%, transparent);
  backdrop-filter: blur(18px);
}
[data-pi-session-ui="radix"] .sidebar-controls,
[data-pi-session-ui="radix"] .sidebar-filters {
  padding: 0;
}
[data-pi-session-ui="radix"] .sidebar-filters {
  margin-top: 10px;
  gap: 6px;
}
[data-pi-session-ui="radix"] .sidebar-search {
  height: 38px;
  padding: 0 12px 0 34px;
  border: 1px solid var(--borderMuted);
  border-radius: 10px;
  background:
    linear-gradient(90deg, transparent 31px, var(--borderMuted) 31px, var(--borderMuted) 32px, transparent 32px),
    color-mix(in srgb, var(--body-bg) 72%, transparent);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
[data-pi-session-ui="radix"] .sidebar-controls::before {
  position: absolute;
  z-index: 1;
  width: 16px;
  height: 16px;
  margin: 11px 0 0 10px;
  border: 1.5px solid var(--muted);
  border-radius: 50%;
  content: "";
  pointer-events: none;
}
[data-pi-session-ui="radix"] .sidebar-controls::after {
  position: absolute;
  z-index: 1;
  width: 6px;
  height: 1.5px;
  margin: -8px 0 0 23px;
  background: var(--muted);
  content: "";
  pointer-events: none;
  transform: rotate(45deg);
}
[data-pi-session-ui="radix"] .sidebar-search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}
[data-pi-session-ui="radix"] .filter-btn,
[data-pi-session-ui="radix"] :is(.header-toggle-btn, .download-json-btn, .sidebar-close) {
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--borderMuted);
  border-radius: 8px;
  background: color-mix(in srgb, var(--container-bg) 82%, transparent);
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
[data-pi-session-ui="radix"] .filter-btn:hover,
[data-pi-session-ui="radix"] :is(.header-toggle-btn, .download-json-btn, .sidebar-close):hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: var(--selectedBg);
  color: var(--text);
}
[data-pi-session-ui="radix"] .filter-btn.active {
  border-color: color-mix(in srgb, var(--accent) 58%, transparent);
  background: color-mix(in srgb, var(--accent) 16%, var(--container-bg));
  color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 9%, transparent);
}
[data-pi-session-ui="radix"] .tree-container {
  overflow-x: hidden;
  padding: 10px 8px;
}
[data-pi-session-ui="radix"] .tree-node {
  min-height: 30px;
  margin: 2px 0;
  padding: 6px 8px;
  overflow: hidden;
  border-radius: 8px;
  font-size: 11px;
  line-height: 18px;
}
[data-pi-session-ui="radix"] .tree-node:hover,
[data-pi-session-ui="radix"] .tree-node.active {
  background: var(--selectedBg);
}
[data-pi-session-ui="radix"] .tree-node.active {
  box-shadow: inset 2px 0 var(--accent);
}
[data-pi-session-ui="radix"] .tree-content {
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-pi-session-ui="radix"] .tree-status {
  padding: 10px 16px;
  border-top: 1px solid var(--borderMuted);
  background: var(--container-bg);
  font: 600 11px/1.4 ui-monospace, monospace;
}
[data-pi-session-ui="radix"] #sidebar-resizer {
  width: 8px;
  border: 0;
}
[data-pi-session-ui="radix"] #sidebar-resizer:hover,
[data-pi-session-ui="radix"] body.sidebar-resizing #sidebar-resizer {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
[data-pi-session-ui="radix"] #content {
  padding: 32px clamp(20px, 4vw, 64px) 80px;
}
[data-pi-session-ui="radix"] #content > * {
  max-width: 1080px;
}
[data-pi-session-ui="radix"] .header {
  margin-bottom: 16px;
  padding: 22px 24px;
  border: 1px solid var(--borderMuted);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent 52%),
    color-mix(in srgb, var(--container-bg) 92%, transparent);
  box-shadow: 0 18px 50px rgb(0 0 0 / 10%);
}
[data-pi-session-ui="radix"] .header h1 {
  margin-bottom: 16px;
  color: var(--text);
  font-size: 16px;
  letter-spacing: -.02em;
}
[data-pi-session-ui="radix"] .header h1::before {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 14px var(--accent);
  content: "";
}
[data-pi-session-ui="radix"] .header-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 18px;
  font-size: 12px;
}
[data-pi-session-ui="radix"] .info-item {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--body-bg) 52%, transparent);
}
[data-pi-session-ui="radix"] .info-label {
  min-width: auto;
  margin-right: 7px;
  color: var(--muted);
}
[data-pi-session-ui="radix"] .info-value {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-pi-session-ui="radix"] .help-bar {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--borderMuted);
  border-radius: 12px;
  background: color-mix(in srgb, var(--container-bg) 76%, transparent);
  color: var(--muted);
}
[data-pi-session-ui="radix"] #messages {
  gap: 16px;
}
[data-pi-session-ui="radix"] :is(.user-message, .assistant-message, .skill-user-entry) {
  overflow: hidden;
  border: 1px solid var(--borderMuted);
  border-radius: 16px;
  background: color-mix(in srgb, var(--container-bg) 88%, transparent);
  box-shadow: 0 16px 42px rgb(0 0 0 / 8%);
}
[data-pi-session-ui="radix"] .user-message {
  padding: 20px;
  border-color: color-mix(in srgb, var(--accent) 24%, var(--borderMuted));
  background:
    linear-gradient(110deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 42%),
    var(--userMessageBg);
}
[data-pi-session-ui="radix"] .assistant-message {
  padding: 18px 0 20px;
}
[data-pi-session-ui="radix"] .message-timestamp {
  padding: 0 20px 8px !important;
  color: var(--dim);
  font: 600 10px/1.4 ui-monospace, monospace;
  letter-spacing: .08em;
  text-transform: uppercase;
}
[data-pi-session-ui="radix"] .assistant-text {
  padding: 0 20px;
}
[data-pi-session-ui="radix"] .copy-link-btn {
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-color: var(--borderMuted);
  border-radius: 9px;
  background: var(--container-bg);
  color: var(--muted);
}
[data-pi-session-ui="radix"] :is(.tool-execution, .compaction, .system-prompt, .tools-list, .hook-message, .skill-invocation, .branch-summary) {
  margin-inline: 20px;
  padding: 14px 16px;
  border: 1px solid var(--borderMuted);
  border-radius: 12px;
}
[data-pi-session-ui="radix"] .tool-execution + .tool-execution,
[data-pi-session-ui="radix"] .assistant-text + .tool-execution {
  margin-top: 10px;
}
[data-pi-session-ui="radix"] .tool-header {
  color: var(--text);
  font-size: 12px;
}
[data-pi-session-ui="radix"] .tool-output {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--borderMuted);
  font-size: 12px;
  line-height: 1.6;
}
[data-pi-session-ui="radix"] .markdown-content {
  color: var(--text);
  font-size: 14px;
  line-height: 1.75;
}
[data-pi-session-ui="radix"] .markdown-content :is(h1, h2, h3, h4, h5, h6) {
  color: var(--mdHeading);
  line-height: 1.3;
}
[data-pi-session-ui="radix"] .markdown-content h1 { margin: 28px 0 12px; font-size: 1.65rem; }
[data-pi-session-ui="radix"] .markdown-content h2 { margin: 26px 0 10px; font-size: 1.35rem; }
[data-pi-session-ui="radix"] .markdown-content h3 { margin: 22px 0 8px; font-size: 1.08rem; }
[data-pi-session-ui="radix"] .markdown-content :is(h4, h5, h6) { margin: 18px 0 8px; font-size: .95rem; }
[data-pi-session-ui="radix"] .markdown-content p + p {
  margin-top: 14px;
}
[data-pi-session-ui="radix"] .markdown-content pre:not(.pi-mermaid-source) {
  margin: 16px 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid var(--borderMuted);
  border-radius: 12px;
  background: color-mix(in srgb, var(--body-bg) 82%, transparent);
}
[data-pi-session-ui="radix"] .markdown-content pre:not(.pi-mermaid-source) code {
  font-size: 12px;
  line-height: 1.65;
}
[data-pi-session-ui="radix"] .markdown-content table {
  margin: 18px 0;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--mdCodeBlockBorder);
  border-radius: 12px;
  overflow: hidden;
}
[data-pi-session-ui="radix"] .markdown-content :is(th, td) {
  padding: 10px 12px;
  border: 0;
  border-right: 1px solid var(--mdCodeBlockBorder);
  border-bottom: 1px solid var(--mdCodeBlockBorder);
}
[data-pi-session-ui="radix"] .markdown-content tr > :last-child { border-right: 0; }
[data-pi-session-ui="radix"] .markdown-content tr:last-child > * { border-bottom: 0; }
[data-pi-session-ui="radix"] .markdown-content th {
  background: color-mix(in srgb, var(--selectedBg) 72%, transparent);
}
[data-pi-session-ui="radix"] .markdown-content blockquote {
  padding: 10px 14px;
  border-left-width: 2px;
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--selectedBg) 45%, transparent);
  font-style: normal;
}
[data-pi-session-ui="radix"] :is(*, *::before, *::after) {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbarThumb) transparent;
}
[data-pi-session-ui="radix"] #hamburger {
  top: 14px;
  left: 14px;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--borderMuted);
  border-radius: 10px;
  background: color-mix(in srgb, var(--container-bg) 94%, transparent);
  color: var(--text);
  box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
}
@media (max-width: 900px) {
  [data-pi-session-ui="radix"] #sidebar {
    width: min(var(--sidebar-width), calc(100vw - 40px));
    min-width: min(var(--sidebar-width), calc(100vw - 40px));
    max-width: min(var(--sidebar-width), calc(100vw - 40px));
    box-shadow: 24px 0 70px rgb(0 0 0 / 36%);
  }
  [data-pi-session-ui="radix"] #sidebar-overlay.open {
    background: rgb(2 6 23 / 64%);
    backdrop-filter: blur(3px);
  }
  [data-pi-session-ui="radix"] #content {
    padding: 68px 14px 48px;
  }
  [data-pi-session-ui="radix"] .header-info {
    grid-template-columns: 1fr;
  }
  [data-pi-session-ui="radix"] :is(.user-message, .assistant-message, .skill-user-entry) {
    border-radius: 13px;
  }
  [data-pi-session-ui="radix"] .user-message,
  [data-pi-session-ui="radix"] .assistant-text {
    padding-inline: 14px;
  }
  [data-pi-session-ui="radix"] :is(.tool-execution, .compaction, .system-prompt, .tools-list, .hook-message, .skill-invocation, .branch-summary) {
    margin-inline: 14px;
  }
}
`;

export function installSessionStyle(): void {
  document.documentElement.dataset.piSessionUi = "radix";
  const style = document.createElement("style");
  style.dataset.piSessionStyle = "radix";
  style.textContent = SESSION_STYLE;
  document.head.append(style);
}
