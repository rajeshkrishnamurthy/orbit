function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && entry.contextId)
    .map((entry) => ({
      contextId: String(entry.contextId),
      contextTitle: String(entry.contextTitle || ''),
      isActive: Boolean(entry.isActive),
      visibleCount: Number.isFinite(entry.visibleCount) ? Math.max(0, entry.visibleCount) : 0,
      staleCount: Number.isFinite(entry.staleCount) ? Math.max(0, entry.staleCount) : 0,
    }));
}

function orderedEntries(entries, activeContextId) {
  const activeID = (activeContextId || '').trim();
  const normalized = normalizeEntries(entries).map((entry) => ({
    ...entry,
    isActive: activeID ? entry.contextId === activeID : entry.isActive,
  }));
  normalized.sort((a, b) => {
    const at = a.contextTitle.toLowerCase();
    const bt = b.contextTitle.toLowerCase();
    if (at !== bt) return at < bt ? -1 : 1;
    return a.contextId < b.contextId ? -1 : 1;
  });
  return normalized;
}

export function createChromeContextStripController({
  documentRef,
  container,
  mode,
  activeContextId,
  initialEntries,
  getTransport,
  onNavigate,
}) {
  if (!container || mode !== 'focus') {
    return {
      refresh: async () => {},
      closeOverflow: () => {},
      handleGlobalPointerDown: () => {},
    };
  }

  let entries = orderedEntries(initialEntries, activeContextId);
  let overflowOpen = false;
  let currentActiveID = activeContextId;

  function closeOverflow() {
    overflowOpen = false;
    render();
  }

  function createEntryButton(entry, className, labelClass, countClass) {
    const btn = documentRef.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.title = entry.contextTitle;

    const label = documentRef.createElement('span');
    label.className = labelClass;
    label.textContent = entry.contextTitle;

    const count = documentRef.createElement('span');
    count.className = countClass;
    count.textContent = `${entry.visibleCount}/${entry.staleCount}`;

    btn.append(label, count);
    btn.addEventListener('click', () => {
      closeOverflow();
      onNavigate(entry.contextId);
    });
    return btn;
  }

  function render() {
    container.innerHTML = '';
    if (!entries.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    const visibleEntries = entries.length <= 8 ? entries : entries.slice(0, 7);
    const overflowEntries = entries.length <= 8 ? [] : entries.slice(7);

    for (const entry of visibleEntries) {
      const className = entry.isActive ? 'chrome-context-strip__pill chrome-context-strip__pill--active' : 'chrome-context-strip__pill';
      const pill = createEntryButton(entry, className, 'chrome-context-strip__pill-label', 'chrome-context-strip__pill-count');
      container.appendChild(pill);
    }

    if (overflowEntries.length > 0) {
      const overflowToggle = documentRef.createElement('button');
      overflowToggle.type = 'button';
      overflowToggle.className = 'chrome-context-strip__overflow-toggle';
      overflowToggle.textContent = `+${overflowEntries.length}`;
      overflowToggle.addEventListener('click', () => {
        overflowOpen = !overflowOpen;
        render();
      });
      container.appendChild(overflowToggle);

      const overflow = documentRef.createElement('div');
      overflow.className = 'chrome-context-strip__overflow';
      overflow.hidden = !overflowOpen;
      for (const entry of overflowEntries) {
        overflow.appendChild(createEntryButton(entry, 'chrome-context-strip__overflow-item', 'chrome-context-strip__overflow-item-label', 'chrome-context-strip__overflow-item-count'));
      }
      container.appendChild(overflow);
    }
  }

  async function refresh() {
    try {
      const transport = await getTransport();
      const result = await transport.loadContextStrip({ contextId: currentActiveID });
      if (!result || !result.ok || !result.data || !Array.isArray(result.data.entries)) return;
      entries = orderedEntries(result.data.entries, currentActiveID);
      render();
    } catch (_err) {
      // Keep last known strip state if refresh fails.
    }
  }

  function handleGlobalPointerDown(target) {
    if (!overflowOpen) return;
    if (target instanceof Element && target.closest('.chrome-context-strip')) return;
    closeOverflow();
  }

  render();

  return {
    refresh,
    closeOverflow,
    handleGlobalPointerDown,
    setActiveContext(nextID) {
      currentActiveID = nextID;
      entries = orderedEntries(entries, currentActiveID);
      render();
    },
  };
}
