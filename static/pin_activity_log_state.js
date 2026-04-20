const MAX_ACTIVITY_LOG_CHARS = 140;
const MAX_SURFACED_ENTRIES = 5;

function compactTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizedInput(raw) {
  const text = raw || '';
  const trimmed = text.trim();
  return {
    raw: text,
    trimmed,
    length: Array.from(text).length,
    trimmedLength: Array.from(trimmed).length,
  };
}

export function createPinActivityLogController({
  layoutShell,
  mode,
  getMutationTransport,
  syncCanvasViewportRect,
  showCanvasWarning,
}) {
  let panel = null;
  let anchorEl = null;
  let itemID = '';
  let entries = [];
  let loading = false;
  let saveInFlight = false;

  function close() {
    if (!panel) return;
    panel.remove();
    panel = null;
    anchorEl = null;
    itemID = '';
    entries = [];
    loading = false;
    saveInFlight = false;
    syncCanvasViewportRect();
  }

  function isOpen() {
    return !!panel;
  }

  function isOpenForItem(nextItemID) {
    if (!panel) return false;
    return itemID === (nextItemID || '').trim();
  }

  function place(nextAnchor) {
    if (!panel || !nextAnchor) return;
    const anchorRect = nextAnchor.getBoundingClientRect();
    const shellRect = layoutShell.getBoundingClientRect();
    const width = 300;
    const minInset = 8;
    const left = Math.max(
      minInset,
      Math.min(layoutShell.clientWidth - width - minInset, (anchorRect.right - shellRect.left) - width + 24),
    );
    const top = Math.max(
      minInset,
      Math.min(layoutShell.clientHeight - 290, (anchorRect.bottom - shellRect.top) + 8),
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function renderEntries() {
    if (!panel) return;
    const list = panel.querySelector('.activity-log-popover__entries');
    if (!list) return;
    if (loading) {
      list.innerHTML = '<div class="activity-log-popover__empty">Loading recent updates...</div>';
      return;
    }
    if (entries.length === 0) {
      list.innerHTML = '<div class="activity-log-popover__empty">Add a short update so future-you can quickly resume this card.</div>';
      return;
    }
    list.innerHTML = '';
    entries.slice(0, MAX_SURFACED_ENTRIES).forEach((entry) => {
      const row = document.createElement('article');
      row.className = 'activity-log-popover__entry';
      const body = document.createElement('div');
      body.className = 'activity-log-popover__entry-body';
      body.textContent = entry.body || '';
      row.appendChild(body);
      const created = compactTimestamp(entry.createdAt);
      if (created) {
        const time = document.createElement('time');
        time.className = 'activity-log-popover__entry-time';
        time.dateTime = entry.createdAt;
        time.textContent = created;
        row.appendChild(time);
      }
      list.appendChild(row);
    });
  }

  function setSaveState() {
    if (!panel) return;
    const composer = panel.querySelector('.activity-log-popover__composer');
    const save = panel.querySelector('.activity-log-popover__save');
    const counter = panel.querySelector('.activity-log-popover__counter');
    const feedback = panel.querySelector('.activity-log-popover__feedback');
    if (!composer || !save || !counter || !feedback) return;

    const info = normalizedInput(composer.value);
    const overLimit = info.length > MAX_ACTIVITY_LOG_CHARS;
    const blankAfterTrim = info.trimmedLength === 0;
    const canSave = !saveInFlight && !overLimit && !blankAfterTrim;

    save.disabled = !canSave;
    counter.textContent = `${info.length}/${MAX_ACTIVITY_LOG_CHARS}`;
    counter.dataset.overLimit = overLimit ? 'true' : 'false';
    composer.setAttribute('aria-invalid', overLimit ? 'true' : 'false');

    if (overLimit) {
      feedback.textContent = `Keep it to ${MAX_ACTIVITY_LOG_CHARS} characters.`;
      feedback.hidden = false;
      return;
    }
    feedback.textContent = '';
    feedback.hidden = true;
  }

  async function loadLatest() {
    if (!panel || !itemID) return;
    loading = true;
    renderEntries();
    try {
      const transport = await getMutationTransport();
      const result = await transport.loadLatestActivityLog({ itemId: itemID });
      if (!result.ok) throw new Error(result.error || 'load failed');
      const data = result.data || {};
      entries = Array.isArray(data.entries) ? data.entries.slice(0, MAX_SURFACED_ENTRIES) : [];
      renderEntries();
    } catch (_err) {
      loading = false;
      renderEntries();
      const list = panel.querySelector('.activity-log-popover__entries');
      if (list) {
        list.innerHTML = '<div class="activity-log-popover__empty">Unable to load recent updates.</div>';
      }
      return;
    }
    loading = false;
    renderEntries();
  }

  async function saveEntry() {
    if (!panel || saveInFlight || !itemID) return;
    const composer = panel.querySelector('.activity-log-popover__composer');
    if (!composer) return;

    const info = normalizedInput(composer.value);
    const overLimit = info.length > MAX_ACTIVITY_LOG_CHARS;
    if (overLimit || info.trimmedLength === 0) {
      setSaveState();
      return;
    }

    saveInFlight = true;
    setSaveState();

    try {
      const transport = await getMutationTransport();
      const result = await transport.appendActivityLog({ itemId: itemID, body: info.trimmed });
      if (!result.ok) {
        transport.logMutationFailure({
          operation: 'activity-log-add',
          id: itemID,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error,
        });
        throw new Error(result.error || 'save failed');
      }
      const data = result.data || {};
      if (data.entry) {
        entries = [data.entry, ...entries].slice(0, MAX_SURFACED_ENTRIES);
      }
      composer.value = '';
      renderEntries();
    } catch (_err) {
      showCanvasWarning('Unable to save activity log. Please try again.');
    } finally {
      saveInFlight = false;
      setSaveState();
    }
  }

  function bindPanelEvents() {
    if (!panel) return;
    const composer = panel.querySelector('.activity-log-popover__composer');
    const save = panel.querySelector('.activity-log-popover__save');
    if (composer) {
      composer.addEventListener('input', () => setSaveState());
      composer.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void saveEntry();
        }
      });
    }
    if (save) {
      save.addEventListener('click', () => {
        void saveEntry();
      });
    }
  }

  function open(pin, { anchorEl: nextAnchorEl } = {}) {
    if (mode !== 'focus' || !pin) return;
    const nextItemID = (pin.dataset.id || '').trim();
    if (!nextItemID) return;

    close();
    itemID = nextItemID;
    anchorEl = nextAnchorEl || null;

    panel = document.createElement('section');
    panel.className = 'activity-log-popover';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Activity log');
    panel.innerHTML = `
      <header class="activity-log-popover__header">Activity log</header>
      <div class="activity-log-popover__entries" aria-live="polite"></div>
      <label class="activity-log-popover__composer-wrap">
        <span class="activity-log-popover__composer-label">Quick update</span>
        <textarea class="activity-log-popover__composer" rows="2" placeholder="Add a short update..."></textarea>
      </label>
      <div class="activity-log-popover__footer">
        <span class="activity-log-popover__feedback" hidden></span>
        <span class="activity-log-popover__counter">0/${MAX_ACTIVITY_LOG_CHARS}</span>
        <button type="button" class="activity-log-popover__save" disabled>Save</button>
      </div>
    `;
    panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    panel.addEventListener('click', (event) => event.stopPropagation());

    layoutShell.appendChild(panel);
    place(anchorEl);
    bindPanelEvents();
    setSaveState();
    void loadLatest();

    const composer = panel.querySelector('.activity-log-popover__composer');
    if (composer) composer.focus();
    syncCanvasViewportRect();
  }

  window.addEventListener('resize', () => {
    if (!panel) return;
    place(anchorEl);
  });

  return {
    close,
    isOpen,
    isOpenForItem,
    open,
    repositionIfOpen() {
      if (!panel) return;
      place(anchorEl);
    },
  };
}
