export function createResurfaceShelfController({
  container,
  initialItems = [],
  mode,
  currentContextId,
  getMutationTransport,
  refreshIntervalMs = 60 * 60 * 1000,
}) {
  const shelf = container;
  const list = document.createElement('div');
  list.className = 'resurface-shelf__list';
  shelf.innerHTML = '';
  shelf.appendChild(list);

  let itemsByID = new Map();
  let intervalID = null;

  function normalizeItems(items) {
    const next = new Map();
    for (const raw of items || []) {
      if (!raw || !raw.id) continue;
      if (next.has(raw.id)) continue;
      next.set(raw.id, raw);
    }
    return next;
  }

  function render() {
    if (mode !== 'focus' || itemsByID.size === 0) {
      shelf.hidden = true;
      list.innerHTML = '';
      return;
    }
    shelf.hidden = false;
    list.innerHTML = '';
    for (const item of itemsByID.values()) {
      const cardlet = document.createElement('div');
      cardlet.className = 'resurface-shelf__cardlet';
      cardlet.dataset.id = item.id;
      cardlet.textContent = item.title || 'Untitled';
      list.appendChild(cardlet);
    }
  }

  function setItems(items) {
    itemsByID = normalizeItems(items);
    render();
  }

  async function refresh() {
    if (mode !== 'focus') return;
    try {
      const transport = await getMutationTransport();
      const result = await transport.loadResurfacedItems({ contextId: currentContextId });
      if (!result.ok) return;
      const data = result.data || {};
      setItems(data.items || []);
    } catch (_err) {
      // Non-fatal: next interval/app trigger will retry.
    }
  }

  function removeItem(id) {
    if (!id || !itemsByID.has(id)) return;
    itemsByID.delete(id);
    render();
  }

  function startHourlyRefresh() {
    if (mode !== 'focus') return;
    if (intervalID != null) return;
    intervalID = window.setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
  }

  function stop() {
    if (intervalID == null) return;
    window.clearInterval(intervalID);
    intervalID = null;
  }

  setItems(initialItems);
  startHourlyRefresh();

  return {
    refresh,
    removeItem,
    setItems,
    stop,
  };
}
