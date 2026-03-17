// Source TypeScript for Orbit interactions. JS runtime file mirrors this logic.
// Hidden popdown immediate unhide sync patch (keep in sync with app.js).

type HiddenItem = { id: string; title?: string; x?: number; y?: number };
type PendingUnhide = { item: HiddenItem; index: number; x: number; y: number };

declare const hiddenTray: HTMLDivElement;
declare const hiddenBtn: HTMLButtonElement | null;
declare const surface: HTMLElement;
declare const currentContextId: string;
declare const mode: string;
declare let hiddenItemsCache: HiddenItem[];
declare let hiddenCount: number;
declare let trayOpen: boolean;
declare function placeHiddenTray(): void;
declare function showCanvasWarning(message: string): void;
declare function setDragHalo(on: boolean): void;
declare function createPin(item: HiddenItem, focusTitle: boolean, markSaved: boolean): HTMLElement;

const pendingUnhide = new Map<string, PendingUnhide>();

function renderHiddenTrayItems(): void {
  hiddenTray.innerHTML = '';
  if (hiddenItemsCache.length === 0) {
    hiddenTray.innerHTML = '<div class="hidden-tray-empty">No hidden cards</div>';
    return;
  }
  hiddenItemsCache.forEach((it) => {
    const t = document.createElement('div');
    t.className = 'hidden-tray-item';
    t.dataset.id = it.id;
    t.textContent = it.title || 'Untitled';
    t.draggable = true;
    t.addEventListener('dragstart', (ev) => {
      ev.dataTransfer?.setData('text/orbit-hidden-id', it.id);
    });
    hiddenTray.appendChild(t);
  });
}

function closeHiddenTray(): void {
  hiddenTray.hidden = true;
  hiddenTray.innerHTML = '';
  trayOpen = false;
  renderHiddenButton();
}

function syncHiddenTray(): void {
  if (!trayOpen) return;
  renderHiddenTrayItems();
}

async function openHiddenTray(): Promise<void> {
  hiddenTray.hidden = false;
  placeHiddenTray();
  hiddenTray.innerHTML = '<div class="hidden-tray-empty">Loading…</div>';
  try {
    const res = await fetch('/api/items/hidden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextId: currentContextId }),
    });
    const data = await res.json();
    hiddenItemsCache = (data.items || []).filter((it: HiddenItem) => !pendingUnhide.has(it.id));
    renderHiddenTrayItems();
    trayOpen = true;
  } catch (_err) {
    hiddenTray.innerHTML = '<div class="hidden-tray-empty">Unable to load hidden cards</div>';
    trayOpen = true;
  }
}

function renderHiddenButton(): void {
  if (!hiddenBtn) return;
  hiddenBtn.textContent = `Hidden (${hiddenCount})`;
  hiddenBtn.hidden = hiddenCount <= 0 && !trayOpen;
}

async function persistHiddenUnhide(id: string, x: number, y: number): Promise<void> {
  try {
    const res = await fetch('/api/items/unhide-at', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, contextId: currentContextId, x, y }),
    });
    if (!res.ok) throw new Error('unhide failed');
    const pending = pendingUnhide.get(id);
    if (!pending) return;
    pendingUnhide.delete(id);
    pending.item.x = x;
    pending.item.y = y;
    if (!surface.querySelector(`.pin[data-id="${id}"]`)) createPin(pending.item, false, true);
  } catch (_err) {
    const pending = pendingUnhide.get(id);
    if (!pending) return;
    pendingUnhide.delete(id);
    if (!hiddenItemsCache.find((i) => i.id === id)) {
      if (Number.isInteger(pending.index) && pending.index >= 0 && pending.index <= hiddenItemsCache.length) {
        hiddenItemsCache.splice(pending.index, 0, pending.item);
      } else {
        hiddenItemsCache.push(pending.item);
      }
      hiddenCount += 1;
      renderHiddenButton();
      syncHiddenTray();
    }
    showCanvasWarning("Couldn\u2019t unhide item. Please try again.");
  }
}

function handleHiddenDrop(e: DragEvent): void {
  if (!trayOpen || mode !== 'focus') return;
  const id = e.dataTransfer?.getData('text/orbit-hidden-id');
  if (!id) return;
  e.preventDefault();
  setDragHalo(false);
  const rect = surface.getBoundingClientRect();
  const x = Math.max(6, Math.min(surface.clientWidth - 190, e.clientX - rect.left));
  const y = Math.max(6, Math.min(surface.clientHeight - 90, e.clientY - rect.top));
  if (pendingUnhide.has(id)) return;
  const itemIndex = hiddenItemsCache.findIndex((i) => i.id === id);
  if (itemIndex < 0) return;
  const item = hiddenItemsCache[itemIndex];
  pendingUnhide.set(id, { item, index: itemIndex, x, y });
  hiddenItemsCache = hiddenItemsCache.filter((i) => i.id !== id);
  hiddenCount = Math.max(0, hiddenCount - 1);
  renderHiddenButton();
  syncHiddenTray();
  void persistHiddenUnhide(id, x, y);
}
