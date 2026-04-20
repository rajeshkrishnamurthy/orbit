function safeJSONParse(input, fallback) {
  try {
    return JSON.parse(input);
  } catch (_err) {
    return fallback;
  }
}

function normalizePersonName(input) {
  return String(input || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sortPeopleStable(people) {
  return [...(people || [])].sort((a, b) => {
    const left = String(a.display_name || '').toLowerCase();
    const right = String(b.display_name || '').toLowerCase();
    if (left === right) return String(a.id || '').localeCompare(String(b.id || ''));
    return left.localeCompare(right);
  });
}

function readPinPersonIDs(pin) {
  if (!pin) return [];
  const parsed = safeJSONParse(pin.dataset.personIds || '[]', []);
  if (!Array.isArray(parsed)) return [];
  const unique = [];
  const seen = new Set();
  parsed.forEach((id) => {
    const val = String(id || '').trim();
    if (!val || seen.has(val)) return;
    seen.add(val);
    unique.push(val);
  });
  return unique;
}

function writePinPersonIDs(pin, ids) {
  const unique = [];
  const seen = new Set();
  (ids || []).forEach((id) => {
    const val = String(id || '').trim();
    if (!val || seen.has(val)) return;
    seen.add(val);
    unique.push(val);
  });
  pin.dataset.personIds = JSON.stringify(unique);
}

export function createPinPeopleController({
  documentRef,
  layoutShell,
  surface,
  getTransport,
  showCanvasWarning,
  closeActivityLogPopover,
  savePin,
  onPeopleUpdated,
}) {
  let panel = null;
  let openPin = null;
  let peopleCache = [];

  function isOpen() {
    return !!panel && !!openPin;
  }

  function close() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    openPin = null;
  }

  async function refreshPeople() {
    const transport = await getTransport();
    const result = await transport.listPeople();
    if (!result.ok) {
      transport.logMutationFailure({
        operation: 'people-list',
        endpoint: result.endpoint,
        status: result.status,
        error: result.error,
      });
      throw new Error(result.error || 'unable to load people');
    }
    const list = Array.isArray(result.data && result.data.people) ? result.data.people : [];
    peopleCache = sortPeopleStable(list);
    if (typeof onPeopleUpdated === 'function') onPeopleUpdated(peopleCache);
    return peopleCache;
  }

  function updateIndicator(pin) {
    const indicator = pin.querySelector('.pin-people-indicator');
    const count = readPinPersonIDs(pin).length;
    if (!indicator) return;
    indicator.dataset.count = String(count);
    const countEl = indicator.querySelector('.pin-people-indicator__count');
    if (countEl) countEl.textContent = String(count);
  }

  function attachPerson(pin, personId) {
    const next = readPinPersonIDs(pin);
    if (!next.includes(personId)) next.push(personId);
    writePinPersonIDs(pin, next);
    updateIndicator(pin);
    savePin(pin);
  }

  function detachPerson(pin, personId) {
    const next = readPinPersonIDs(pin).filter((id) => id !== personId);
    writePinPersonIDs(pin, next);
    updateIndicator(pin);
    savePin(pin);
  }

  async function createAndAttach(pin, displayName) {
    const transport = await getTransport();
    const result = await transport.createPerson({ displayName });
    if (!result.ok || !result.data || !result.data.person || !result.data.person.id) {
      const message = (result && result.error) || 'Unable to create person';
      showCanvasWarning(message);
      return false;
    }
    await refreshPeople();
    attachPerson(pin, result.data.person.id);
    return true;
  }

  function renderSuggestions(pin, query, container) {
    const personIDs = new Set(readPinPersonIDs(pin));
    const q = String(query || '').trim().toLowerCase();
    const list = sortPeopleStable(peopleCache).filter((person) => {
      if (!person || !person.id) return false;
      if (personIDs.has(person.id)) return false;
      if (!q) return true;
      return String(person.display_name || '').toLowerCase().includes(q);
    });

    container.innerHTML = '';
    list.forEach((person) => {
      const btn = documentRef.createElement('button');
      btn.type = 'button';
      btn.className = 'people-popover__option';
      btn.textContent = person.display_name || person.id;
      btn.addEventListener('click', () => {
        attachPerson(pin, person.id);
        renderPanel(pin);
      });
      container.appendChild(btn);
    });

    const normalizedQuery = normalizePersonName(query);
    if (normalizedQuery) {
      const exactMatch = peopleCache.some((person) => normalizePersonName(person.display_name) === normalizedQuery);
      if (!exactMatch) {
        const createBtn = documentRef.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'people-popover__create';
        createBtn.textContent = `Create "${String(query).trim()}"`;
        createBtn.addEventListener('click', async () => {
          const created = await createAndAttach(pin, query);
          if (created && panel) {
            const searchInput = panel.querySelector('.people-popover__search');
            if (searchInput) searchInput.value = '';
          }
          renderPanel(pin);
        });
        container.appendChild(createBtn);
      }
    }

    if (!container.children.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'people-popover__empty';
      empty.textContent = 'No available people';
      container.appendChild(empty);
    }
  }

  function renderAttached(pin, container) {
    const map = new Map((peopleCache || []).map((person) => [person.id, person]));
    const attached = readPinPersonIDs(pin)
      .map((id) => map.get(id) || { id, display_name: id })
      .sort((a, b) => {
        const left = String(a.display_name || '').toLowerCase();
        const right = String(b.display_name || '').toLowerCase();
        if (left === right) return String(a.id || '').localeCompare(String(b.id || ''));
        return left.localeCompare(right);
      });

    container.innerHTML = '';
    if (!attached.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'people-popover__empty';
      empty.textContent = 'No people attached';
      container.appendChild(empty);
      return;
    }

    attached.forEach((person) => {
      const row = documentRef.createElement('div');
      row.className = 'people-popover__attached-row';
      const label = documentRef.createElement('span');
      label.className = 'people-popover__attached-name';
      label.textContent = person.display_name || person.id;
      const remove = documentRef.createElement('button');
      remove.type = 'button';
      remove.className = 'people-popover__attached-remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        detachPerson(pin, person.id);
        renderPanel(pin);
      });
      row.append(label, remove);
      container.appendChild(row);
    });
  }

  function positionPanel(pin, anchorEl) {
    if (!panel) return;
    const anchor = anchorEl || pin.querySelector('.pin-people-indicator') || pin;
    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;

    const panelWidth = panel.offsetWidth || 320;
    const panelHeight = panel.offsetHeight || 260;

    const maxLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding);
    const left = Math.min(maxLeft, Math.max(viewportPadding, rect.left));

    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - panelHeight - gap;
    const top = (belowTop + panelHeight <= window.innerHeight - viewportPadding)
      ? belowTop
      : Math.max(viewportPadding, aboveTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function renderPanel(pin, anchorEl) {
    if (!panel) return;
    const attachedContainer = panel.querySelector('.people-popover__attached');
    const searchInput = panel.querySelector('.people-popover__search');
    const optionsContainer = panel.querySelector('.people-popover__options');
    renderAttached(pin, attachedContainer);
    renderSuggestions(pin, searchInput.value, optionsContainer);
    positionPanel(pin, anchorEl);
  }

  async function commitSearchQuery(pin) {
    if (!panel) return false;
    const searchInput = panel.querySelector('.people-popover__search');
    const queryRaw = String(searchInput ? searchInput.value : '').trim();
    if (!queryRaw) return false;

    const normalizedQuery = normalizePersonName(queryRaw);
    const attachedIDs = new Set(readPinPersonIDs(pin));
    const exact = peopleCache.find((person) => normalizePersonName(person.display_name) === normalizedQuery);

    if (exact && !attachedIDs.has(exact.id)) {
      attachPerson(pin, exact.id);
      if (searchInput) searchInput.value = '';
      renderPanel(pin);
      return true;
    }

    if (exact && attachedIDs.has(exact.id)) {
      if (searchInput) searchInput.value = '';
      renderPanel(pin);
      return true;
    }

    const created = await createAndAttach(pin, queryRaw);
    if (created && searchInput) searchInput.value = '';
    renderPanel(pin);
    return created;
  }

  function ensurePanel(pin, anchorEl) {
    if (!panel) {
      panel = documentRef.createElement('div');
      panel.className = 'people-popover';
      panel.innerHTML = `
        <header class="people-popover__header">People</header>
        <div class="people-popover__attached" aria-live="polite"></div>
        <label class="people-popover__search-wrap">
          <span class="people-popover__search-label">Add person</span>
          <input class="people-popover__search" type="text" placeholder="Search people" />
        </label>
        <div class="people-popover__options"></div>
      `;
      (layoutShell || documentRef.body).appendChild(panel);
      const searchInput = panel.querySelector('.people-popover__search');
      searchInput.addEventListener('input', () => renderPanel(openPin, anchorEl));
      searchInput.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          close();
          return;
        }
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (!openPin) return;
          await commitSearchQuery(openPin);
        }
      });
    }
    renderPanel(pin, anchorEl);
  }

  async function open(pin, { anchorEl } = {}) {
    if (!pin) return;
    closeActivityLogPopover();
    if (openPin && openPin === pin && panel) {
      close();
      return;
    }
    openPin = pin;
    try {
      await refreshPeople();
    } catch (_err) {
      showCanvasWarning('Unable to load people list.');
      close();
      return;
    }
    ensurePanel(pin, anchorEl);
    updateIndicator(pin);
  }

  function handleOutsidePointer(target) {
    if (!isOpen()) return;
    if (target.closest('.people-popover')) return;
    if (target.closest('.pin-people-indicator')) return;
    close();
  }

  return {
    close,
    handleOutsidePointer,
    isOpen,
    open,
    readPinPersonIDs,
    updateIndicator,
    writePinPersonIDs,
  };
}
