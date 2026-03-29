export function createHiddenTrayController({
  layoutShell,
  systemStrip,
  filtersControls,
  mode,
  currentContextId,
  initialHiddenCount,
  getMutationTransport,
  syncCanvasViewportRect,
}) {
  let hiddenCount = initialHiddenCount || 0;
  let trayOpen = false;
  let hiddenItemsCache = [];
  const pendingUnhide = new Map();
  let hiddenDragPreview = null;

  const hiddenBtn = document.createElement('button');
  hiddenBtn.className = 'hidden-toggle';
  hiddenBtn.id = 'hidden-toggle';
  hiddenBtn.onclick = async () => {
    if (mode !== 'focus') return;
    if (trayOpen) {
      close();
      return;
    }
    await open();
  };
  filtersControls.appendChild(hiddenBtn);
  if (mode !== 'focus') hiddenBtn.hidden = true;

  const hiddenTray = document.createElement('div');
  hiddenTray.className = 'hidden-tray';
  hiddenTray.hidden = true;
  layoutShell.appendChild(hiddenTray);

  function clearHiddenDragPreview() {
    if (!hiddenDragPreview) return;
    hiddenDragPreview.remove();
    hiddenDragPreview = null;
  }

  function showHiddenDragPreview(title, ev) {
    clearHiddenDragPreview();
    const preview = document.createElement('div');
    preview.className = 'hidden-drag-preview';
    preview.textContent = title || 'Untitled';
    document.body.appendChild(preview);
    hiddenDragPreview = preview;
    if (ev.dataTransfer) ev.dataTransfer.setDragImage(preview, 16, 16);
  }

  function placeHiddenTray() {
    const btnRect = hiddenBtn.getBoundingClientRect();
    const stripRect = (systemStrip || layoutShell).getBoundingClientRect();
    const trayWidth = 240;
    const left = Math.max(8, Math.min(layoutShell.clientWidth - trayWidth - 8, (btnRect.right - stripRect.left) - trayWidth));
    const top = Math.max(8, Math.min(layoutShell.clientHeight - 230, (btnRect.bottom - stripRect.top) + 8));
    hiddenTray.style.left = left + 'px';
    hiddenTray.style.top = top + 'px';
  }

  function close() {
    clearHiddenDragPreview();
    hiddenTray.hidden = true;
    hiddenTray.innerHTML = '';
    trayOpen = false;
    renderButton();
  }

  function renderHiddenTrayItems() {
    hiddenTray.innerHTML = '';
    if (hiddenItemsCache.length === 0) {
      hiddenTray.innerHTML = '<div class="hidden-tray-empty">No hidden cards</div>';
      return;
    }
    const msPerDay = 24 * 60 * 60 * 1000;
    const snoozeDaysLeftFor = (item) => {
      const rawWakeAt = item && typeof item.snoozeWakeAt === 'string' ? item.snoozeWakeAt : '';
      if (!rawWakeAt) return null;
      const wakeAtMs = Date.parse(rawWakeAt);
      if (!Number.isFinite(wakeAtMs)) return null;
      const remainingMs = wakeAtMs - Date.now();
      if (remainingMs <= 0) return null;
      return Math.max(1, Math.ceil(remainingMs / msPerDay));
    };
    hiddenItemsCache.forEach((item) => {
      const trayItem = document.createElement('div');
      trayItem.className = 'hidden-tray-item';
      trayItem.dataset.id = item.id;
      const title = document.createElement('span');
      title.className = 'hidden-tray-item__title';
      title.textContent = item.title || 'Untitled';
      trayItem.appendChild(title);
      const snoozeDaysLeft = snoozeDaysLeftFor(item);
      if (snoozeDaysLeft !== null) {
        const snooze = document.createElement('span');
        snooze.className = 'hidden-tray-item__snooze';
        snooze.textContent = `${snoozeDaysLeft}d left`;
        trayItem.appendChild(snooze);
      }
      trayItem.draggable = true;
      trayItem.addEventListener('dragstart', (ev) => {
        showHiddenDragPreview(item.title || 'Untitled', ev);
        ev.dataTransfer.setData('text/orbit-hidden-id', item.id);
      });
      trayItem.addEventListener('dragend', () => {
        clearHiddenDragPreview();
      });
      hiddenTray.appendChild(trayItem);
    });
  }

  function syncTray() {
    if (!trayOpen) return;
    renderHiddenTrayItems();
  }

  async function open() {
    trayOpen = true;
    hiddenTray.hidden = false;
    placeHiddenTray();
    hiddenTray.innerHTML = '<div class="hidden-tray-empty">Loading…</div>';
    try {
      const transport = await getMutationTransport();
      const result = await transport.loadHiddenItems({ contextId: currentContextId });
      if (!result.ok) throw new Error(result.error || 'hidden load failed');
      const data = result.data || {};
      if (!trayOpen) return;
      hiddenItemsCache = (data.items || []).filter((item) => !pendingUnhide.has(item.id));
      renderHiddenTrayItems();
    } catch (_err) {
      if (!trayOpen) return;
      hiddenTray.innerHTML = '<div class="hidden-tray-empty">Unable to load hidden cards</div>';
    }
  }

  function renderButton() {
    hiddenBtn.textContent = `Hidden (${hiddenCount})`;
    const shouldHide = hiddenCount <= 0;
    hiddenBtn.hidden = shouldHide;
    if (shouldHide && trayOpen) {
      close();
      return;
    }
    if (trayOpen) placeHiddenTray();
    syncCanvasViewportRect();
  }

  function repositionIfOpen() {
    if (trayOpen) placeHiddenTray();
  }

  function handleHideSuccess(resultData) {
    hiddenCount = (resultData && Number.isFinite(Number(resultData.hiddenCount))) ? Number(resultData.hiddenCount) : (hiddenCount + 1);
    renderButton();
    if (trayOpen) open();
  }

  function isOpen() {
    return trayOpen;
  }

  function handleSurfaceDragOver(event, {setDragHalo}) {
    if (!trayOpen) return;
    if (event.dataTransfer && event.dataTransfer.types.includes('text/orbit-hidden-id')) {
      event.preventDefault();
      if (mode === 'focus') setDragHalo(true);
    }
  }

  function handleSurfaceDragLeave(event, {surface, setDragHalo}) {
    if (!trayOpen || mode !== 'focus') return;
    const next = event.relatedTarget;
    if (!next || !surface.contains(next)) setDragHalo(false);
  }

  async function handleSurfaceDrop(event, {
    surface,
    setDragHalo,
    getCanvasViewportRect,
    createPin,
    showCanvasWarning,
    showResurfaceAck,
    onUnhideSuccess,
  }) {
    if (!trayOpen || mode !== 'focus') return;
    const id = event.dataTransfer && event.dataTransfer.getData('text/orbit-hidden-id');
    if (!id) return;
    event.preventDefault();
    clearHiddenDragPreview();
    setDragHalo(false);
    const rect = getCanvasViewportRect();
    const x = Math.max(6, Math.min(rect.width - 190, event.clientX - rect.left));
    const y = Math.max(6, Math.min(rect.height - 90, event.clientY - rect.top));
    if (pendingUnhide.has(id)) return;
    const itemIndex = hiddenItemsCache.findIndex((item) => item.id === id);
    if (itemIndex < 0) return;
    const item = hiddenItemsCache[itemIndex];
    pendingUnhide.set(id, { item, index: itemIndex, x, y });
    hiddenItemsCache = hiddenItemsCache.filter((current) => current.id !== id);
    hiddenCount = Math.max(0, hiddenCount - 1);
    renderButton();
    syncTray();
    try {
      const transport = await getMutationTransport();
      const result = await transport.unhideItemAt({ id, contextId: currentContextId, x, y });
      if (!result.ok) {
        transport.logMutationFailure({
          operation: 'unhide-at',
          id,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error,
        });
        throw new Error(result.error || 'unhide failed');
      }
      const data = result.data;
      const pending = pendingUnhide.get(id);
      if (!pending) return;
      pendingUnhide.delete(id);
      const restoredItem = data && data.item ? { ...pending.item, ...data.item, x, y } : { ...pending.item, x, y };
      if (!surface.querySelector(`.pin[data-id="${id}"]`)) createPin(restoredItem, false, true);
      if (typeof onUnhideSuccess === 'function') onUnhideSuccess(id);
      showResurfaceAck();
    } catch (_err) {
      const pending = pendingUnhide.get(id);
      if (!pending) return;
      pendingUnhide.delete(id);
      if (!hiddenItemsCache.find((item) => item.id === id)) {
        if (Number.isInteger(pending.index) && pending.index >= 0 && pending.index <= hiddenItemsCache.length) {
          hiddenItemsCache.splice(pending.index, 0, pending.item);
        } else {
          hiddenItemsCache.push(pending.item);
        }
        hiddenCount += 1;
        renderButton();
        syncTray();
      }
      showCanvasWarning('Couldn’t unhide item. Please try again.');
    }
  }

  return {
    close,
    handleHideSuccess,
    handleSurfaceDragLeave,
    handleSurfaceDragOver,
    handleSurfaceDrop,
    isOpen,
    open,
    renderButton,
    repositionIfOpen,
    syncTray,
  };
}
