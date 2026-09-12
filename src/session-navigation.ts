interface NavigationEntry {
  id?: unknown;
  message?: { role?: unknown; toolCallId?: unknown };
  type?: unknown;
}

interface TreeRenderDetail {
  filteredCount?: unknown;
  searchQuery?: unknown;
  totalCount?: unknown;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function entryText(entry: NavigationEntry): string {
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (!/^(?:id|parentId|timestamp)$/i.test(key)) visit(child);
      }
    }
  };
  visit(entry);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function targetForEntry(
  entryId: string,
  entries: Map<string, NavigationEntry>,
): HTMLElement | null {
  const entry = entries.get(entryId);
  if (
    entry?.type === "message" &&
    entry.message?.role === "toolResult" &&
    typeof entry.message.toolCallId === "string"
  ) {
    return document.getElementById(`tool-call-${entry.message.toolCallId}`);
  }
  return document.getElementById(`entry-${entryId}`);
}

export function installSessionNavigation(
  sessionEntries: NavigationEntry[],
): () => void {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const hamburger = document.getElementById("hamburger");
  const closeButton = document.getElementById("sidebar-close");
  const search = document.getElementById(
    "tree-search",
  ) as HTMLInputElement | null;
  const content = document.getElementById("content");
  const tree = document.getElementById("tree-container");
  if (!sidebar || !overlay || !hamburger || !search || !content || !tree) {
    return () => undefined;
  }

  const entries = new Map(
    sessionEntries
      .filter((entry): entry is NavigationEntry & { id: string } =>
        Boolean(typeof entry.id === "string"),
      )
      .map((entry) => [entry.id, entry]),
  );
  const mobile = window.matchMedia("(max-width: 900px)");
  let drawerOpen = false;
  let pendingFocusId: string | undefined;
  let readingFrame = 0;

  search.setAttribute("aria-label", "Search session navigation");
  const filters = document.querySelector<HTMLElement>(".sidebar-filters");
  if (filters) {
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Navigation filters");
    if (!filters.querySelector(".pi-navigation-filter-label")) {
      const label = document.createElement("span");
      label.className = "pi-navigation-filter-label";
      label.textContent = "Navigation filters";
      filters.prepend(label);
    }
  }
  const noTools = document.querySelector<HTMLButtonElement>(
    '.filter-btn[data-filter="no-tools"]',
  );
  if (noTools) {
    noTools.textContent = "Hide tool entries";
    noTools.title = "Hide tool entries in navigation only";
  }

  const setDrawer = (open: boolean, restoreFocus = true) => {
    if (!mobile.matches) open = false;
    drawerOpen = open;
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("open", open);
    document.documentElement.dataset.piDrawerOpen = String(open);
    sidebar.inert = mobile.matches && !open;
    hamburger.style.display = open ? "none" : "";
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-controls", "sidebar");
    hamburger.setAttribute("aria-label", "Open session navigation");
    overlay.setAttribute("aria-hidden", String(!open));
    if (open) {
      requestAnimationFrame(() => search.focus());
    } else if (restoreFocus && mobile.matches) {
      hamburger.focus({ preventScroll: true });
    }
  };

  const openDrawer = () => setDrawer(true, false);
  const closeDrawer = () => setDrawer(false);
  hamburger.addEventListener("click", openDrawer);
  overlay.addEventListener("click", closeDrawer);
  closeButton?.addEventListener("click", closeDrawer);

  const focusPendingTarget = () => {
    const id = pendingFocusId;
    pendingFocusId = undefined;
    if (!id) return;
    const target = targetForEntry(id, entries);
    if (!target) return;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  };

  const enhanceTree = (detail?: TreeRenderDetail) => {
    for (const node of tree.querySelectorAll<HTMLElement>(".tree-node")) {
      let action = node.querySelector<HTMLButtonElement>(
        ":scope > .pi-tree-action",
      );
      if (!action) {
        action = document.createElement("button");
        action.type = "button";
        action.className = "pi-tree-action";
        while (node.firstChild) action.append(node.firstChild);
        node.append(action);
        action.addEventListener("click", () => {
          const id = node.dataset.id;
          if (!id) return;
          pendingFocusId = id;
          setTimeout(() => {
            if (mobile.matches) setDrawer(false, false);
            focusPendingTarget();
          }, 0);
        });
      }
      action.setAttribute(
        "aria-selected",
        String(node.classList.contains("active")),
      );
      action.dataset.piBranchMember = String(
        node.classList.contains("in-path"),
      );
    }

    tree.querySelector(".pi-navigation-empty")?.remove();
    const query =
      typeof detail?.searchQuery === "string" ? detail.searchQuery.trim() : "";
    const count =
      typeof detail?.filteredCount === "number"
        ? detail.filteredCount
        : tree.querySelectorAll(".tree-node").length;
    const total =
      typeof detail?.totalCount === "number" ? detail.totalCount : entries.size;
    const status = document.getElementById("tree-status");
    if (status) {
      status.textContent = query
        ? `${count} ${count === 1 ? "match" : "matches"} · ${total} entries`
        : `${count} / ${total} entries`;
    }
    if (query && count === 0) {
      const empty = document.createElement("p");
      empty.className = "pi-navigation-empty";
      empty.setAttribute("role", "status");
      empty.textContent = `No navigation matches for “${query}”. Current reading location is unchanged.`;
      tree.append(empty);
    }

    if (query) {
      const token = query.toLocaleLowerCase().split(/\s+/).find(Boolean) ?? "";
      for (const node of tree.querySelectorAll<HTMLElement>(".tree-node")) {
        node.querySelector(".pi-search-snippet")?.remove();
        const id = node.dataset.id;
        const text = id ? entryText(entries.get(id) ?? {}) : "";
        const index = text.toLocaleLowerCase().indexOf(token);
        if (index < 0) continue;
        const start = Math.max(0, index - 32);
        const end = Math.min(text.length, index + token.length + 48);
        const snippet = document.createElement("span");
        snippet.className = "pi-search-snippet";
        snippet.textContent = `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
        node.querySelector(".pi-tree-action")?.append(snippet);
      }
    }
  };

  const updateReadingLocation = () => {
    readingFrame = 0;
    const contentBounds = content.getBoundingClientRect();
    const contentStyle = getComputedStyle(content);
    const contentScrolls =
      /auto|scroll/.test(contentStyle.overflowY) &&
      content.scrollHeight > content.clientHeight;
    const bounds = contentScrolls
      ? { bottom: contentBounds.bottom, top: contentBounds.top }
      : { bottom: window.innerHeight, top: 0 };
    const messages = [
      ...content.querySelectorAll<HTMLElement>('[id^="entry-"]'),
    ]
      .filter((message) => message.getClientRects().length > 0)
      .map((message) => ({ message, rect: message.getBoundingClientRect() }));
    const visible = messages.filter(
      ({ rect }) => rect.bottom > bounds.top && rect.top < bounds.bottom,
    );
    const readingLine = bounds.top + (bounds.bottom - bounds.top) / 2;
    const current =
      visible
        .filter(
          ({ rect }) => rect.top <= readingLine && rect.bottom > readingLine,
        )
        .at(-1) ??
      visible
        .slice()
        .sort(
          (left, right) =>
            Math.abs(left.rect.top - readingLine) -
            Math.abs(right.rect.top - readingLine),
        )[0];
    for (const node of tree.querySelectorAll<HTMLElement>(".tree-node")) {
      const isCurrent =
        Boolean(current) && `entry-${node.dataset.id}` === current.message.id;
      node.classList.toggle("current-reading", isCurrent);
      const action = node.querySelector<HTMLButtonElement>(
        ":scope > .pi-tree-action",
      );
      if (isCurrent) action?.setAttribute("aria-current", "location");
      else action?.removeAttribute("aria-current");
    }
  };
  const scheduleReadingLocation = () => {
    if (!readingFrame)
      readingFrame = requestAnimationFrame(updateReadingLocation);
  };

  const onTreeRender = (event: Event) => {
    enhanceTree((event as CustomEvent<TreeRenderDetail>).detail);
    scheduleReadingLocation();
  };
  const onSessionRender = () => {
    enhanceTree();
    scheduleReadingLocation();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && drawerOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab" || !drawerOpen) return;
    const focusable = [
      ...sidebar.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1) as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onLayoutChange = () => {
    if (mobile.matches) setDrawer(false, false);
    else {
      sidebar.inert = false;
      document.documentElement.dataset.piDrawerOpen = "false";
    }
  };

  document.addEventListener("pi-session-tree-render", onTreeRender);
  document.addEventListener("pi-session-render", onSessionRender);
  document.addEventListener("keydown", onKeyDown, true);
  content.addEventListener("scroll", scheduleReadingLocation, {
    passive: true,
  });
  document.addEventListener("scroll", scheduleReadingLocation, {
    capture: true,
    passive: true,
  });
  mobile.addEventListener("change", onLayoutChange);
  enhanceTree();
  onLayoutChange();
  scheduleReadingLocation();

  return () => {
    cancelAnimationFrame(readingFrame);
    document.removeEventListener("pi-session-tree-render", onTreeRender);
    document.removeEventListener("pi-session-render", onSessionRender);
    document.removeEventListener("keydown", onKeyDown, true);
    content.removeEventListener("scroll", scheduleReadingLocation);
    document.removeEventListener("scroll", scheduleReadingLocation, true);
    mobile.removeEventListener("change", onLayoutChange);
    hamburger.removeEventListener("click", openDrawer);
    overlay.removeEventListener("click", closeDrawer);
    closeButton?.removeEventListener("click", closeDrawer);
  };
}
