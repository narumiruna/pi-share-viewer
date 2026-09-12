export const PI_EXPORT_VERSION = "0.85.0";

export const SESSION_COMPAT_SIGNATURES = {
  cachedMessageClone: `if (entryCache.has(entry.id)) {
          return entryCache.get(entry.id).cloneNode(true);
        }`,
  copyHandler: `copyToClipboard(shareUrl, btn);`,
  escapeHandler: `if (e.key === 'Escape') {
          searchInput.value = '';
          searchQuery = '';
          navigateTo(leafId, 'bottom');
        }`,
  filterCurrentLeaf: `// Always show current leaf
          if (isCurrentLeaf) return true;`,
  headerReplacement: `document.getElementById('header-container').innerHTML = renderHeader();
        attachHeaderHandlers();`,
  messageReplacement: `messagesEl.innerHTML = '';
        messagesEl.appendChild(fragment);`,
  toolTargetMapping: `if (entry?.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolCallId) {
          // getElementById() matches the parsed DOM id attribute, whose HTML entities
          // were already resolved from the escaped id rendered by renderToolCall().
          return \`tool-call-\${entry.message.toolCallId}\`;
        }
        return \`entry-\${entryId}\`;`,
  treeStatus: `document.getElementById('tree-status').textContent = \`\${filtered.length} / \${flatNodes.length} entries\`;`,
} as const;

function findApplication(root: Document): HTMLScriptElement | undefined {
  const scripts = [...root.body.querySelectorAll<HTMLScriptElement>("script")];
  const applications = scripts.filter((script) =>
    script.textContent?.includes("function safeMarkedParse("),
  );
  if (applications.length !== 1) return;
  const application = applications[0];
  const index = scripts.indexOf(application);
  if (
    application.attributes.length !== 0 ||
    index < 2 ||
    scripts[index - 2].attributes.length !== 0 ||
    scripts[index - 1].attributes.length !== 0 ||
    !scripts[index - 2].textContent?.includes("marked v18.0.5") ||
    !scripts[index - 1].textContent?.includes("hljs")
  ) {
    return;
  }
  return application;
}

function occursOnce(source: string, signature: string): boolean {
  return source.split(signature).length === 2;
}

/**
 * Guarded Pi 0.85.0 adapter. Every closure signature is verified before the
 * application source is changed, so template drift always falls back intact.
 */
export function prepareSessionCompatibility(
  root: Document,
): HTMLScriptElement | undefined {
  const application = findApplication(root);
  if (!application) return;
  const original = application.textContent ?? "";
  if (
    !Object.values(SESSION_COMPAT_SIGNATURES).every((signature) =>
      occursOnce(original, signature),
    )
  ) {
    return;
  }

  let source = original;
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.filterCurrentLeaf,
    `// Keep the current location outside filtered search results.
          if (isCurrentLeaf && searchTokens.length === 0) return true;`,
  );
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.headerReplacement,
    `${SESSION_COMPAT_SIGNATURES.headerReplacement}
        document.dispatchEvent(new CustomEvent('pi-session-header-render'));`,
  );
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.messageReplacement,
    `${SESSION_COMPAT_SIGNATURES.messageReplacement}
        document.dispatchEvent(new CustomEvent('pi-session-render', {
          detail: { currentLeafId, currentTargetId, scrollMode, scrollToEntryId }
        }));`,
  );
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.treeStatus,
    `${SESSION_COMPAT_SIGNATURES.treeStatus}
        document.dispatchEvent(new CustomEvent('pi-session-tree-render', {
          detail: { filteredCount: filtered.length, totalCount: flatNodes.length, searchQuery }
        }));`,
  );
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.copyHandler,
    `(globalThis.__PI_SESSION_COPY__ || copyToClipboard)(shareUrl, btn);`,
  );
  source = source.replace(
    SESSION_COMPAT_SIGNATURES.escapeHandler,
    `if (e.key === 'Escape') {
          const escapeEvent = new CustomEvent('pi-session-escape', { cancelable: true });
          if (document.dispatchEvent(escapeEvent)) {
            searchInput.value = '';
            searchQuery = '';
            navigateTo(leafId, 'bottom');
          }
        }`,
  );

  application.textContent = source;
  return application;
}
