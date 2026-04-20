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

const STORAGE_KEY = 'orbit.people-filter-id';

export function createPeopleFilterController({
  documentRef,
  layoutShell,
  filtersControls,
  surface,
  mode,
  getTransport,
  lensState,
  initialPeople,
  showCanvasWarning,
}) {
  if (mode !== 'focus') {
    return {
      applyPredicate: () => {},
      close: () => {},
      handleOutsidePointer: () => {},
      refreshPeople: async () => [],
      syncEmptyState: () => {},
    };
  }

  const wrap = documentRef.createElement('div');
  wrap.className = 'people-filter';
  const pill = documentRef.createElement('button');
  pill.type = 'button';
  pill.className = 'people-filter__pill';
  pill.textContent = 'People';
  wrap.appendChild(pill);
  filtersControls.appendChild(wrap);

  const popover = documentRef.createElement('div');
  popover.className = 'people-filter__popover';
  popover.hidden = true;
  popover.innerHTML = `
    <button type="button" class="people-filter__clear">Clear filter</button>
    <label class="people-filter__search-wrap">
      <input class="people-filter__search" type="text" placeholder="Search people" />
    </label>
    <div class="people-filter__list"></div>
  `;
  layoutShell.appendChild(popover);

  const emptyState = documentRef.createElement('div');
  emptyState.className = 'people-filter__empty-state';
  emptyState.hidden = true;
  emptyState.textContent = 'No visible cards match this person in the active context.';
  layoutShell.appendChild(emptyState);

  let people = sortPeopleStable(initialPeople || []);
  let selectedPersonId = readSessionSelection();

  function readSessionSelection() {
    try {
      const val = sessionStorage.getItem(STORAGE_KEY);
      return val ? String(val).trim() : '';
    } catch (_err) {
      return '';
    }
  }

  function writeSessionSelection(id) {
    try {
      if (!id) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, id);
    } catch (_err) {}
  }

  function personNameByID(id) {
    const person = people.find((entry) => entry.id === id);
    return person ? (person.display_name || person.id) : '';
  }

  function isPinPeopleMatch(pin) {
    if (!selectedPersonId) return true;
    try {
      const parsed = JSON.parse(pin.dataset.personIds || '[]');
      return Array.isArray(parsed) && parsed.includes(selectedPersonId);
    } catch (_err) {
      return false;
    }
  }

  function applyPredicate() {
    lensState.setAdditionalVisibilityPredicate((pin) => isPinPeopleMatch(pin));
    updatePill();
    syncEmptyState();
  }

  function updatePill() {
    const name = personNameByID(selectedPersonId);
    const label = name ? `People: ${name}` : 'People';
    pill.textContent = label;
    pill.classList.toggle('active', !!name);
    pill.title = label;
  }

  function syncEmptyState() {
    if (!selectedPersonId) {
      emptyState.hidden = true;
      return;
    }
    const visibleCount = [...surface.querySelectorAll('.pin')].filter((pin) => pin.style.display !== 'none').length;
    emptyState.hidden = visibleCount > 0;
  }

  function close() {
    popover.hidden = true;
  }

  function open() {
    const rect = pill.getBoundingClientRect();
    popover.style.left = `${Math.max(8, rect.left)}px`;
    popover.style.top = `${rect.bottom + 8}px`;
    popover.hidden = false;
    renderList();
    const search = popover.querySelector('.people-filter__search');
    search.focus();
    search.select();
  }

  function renderList() {
    const search = popover.querySelector('.people-filter__search');
    const q = normalizePersonName(search.value);
    const listEl = popover.querySelector('.people-filter__list');
    listEl.innerHTML = '';

    const filtered = sortPeopleStable(people).filter((person) => {
      if (!q) return true;
      return normalizePersonName(person.display_name).includes(q);
    });

    if (!filtered.length) {
      const empty = documentRef.createElement('div');
      empty.className = 'people-filter__none';
      empty.textContent = 'No people found';
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((person) => {
      const btn = documentRef.createElement('button');
      btn.type = 'button';
      btn.className = 'people-filter__option';
      btn.textContent = person.display_name || person.id;
      btn.classList.toggle('selected', selectedPersonId === person.id);
      btn.addEventListener('click', () => {
        selectedPersonId = person.id;
        writeSessionSelection(selectedPersonId);
        applyPredicate();
        close();
      });
      listEl.appendChild(btn);
    });
  }

  async function refreshPeople(nextPeople) {
    if (Array.isArray(nextPeople)) {
      people = sortPeopleStable(nextPeople);
      if (selectedPersonId && !people.find((person) => person.id === selectedPersonId)) {
        selectedPersonId = '';
        writeSessionSelection('');
      }
      updatePill();
      return people;
    }
    const transport = await getTransport();
    const result = await transport.listPeople();
    if (!result.ok) {
      showCanvasWarning('Unable to load people list.');
      return people;
    }
    people = sortPeopleStable(Array.isArray(result.data && result.data.people) ? result.data.people : []);
    updatePill();
    return people;
  }

  pill.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await refreshPeople();
    if (!popover.hidden) close();
    else open();
  });

  popover.querySelector('.people-filter__search').addEventListener('input', renderList);
  popover.querySelector('.people-filter__clear').addEventListener('click', () => {
    selectedPersonId = '';
    writeSessionSelection('');
    applyPredicate();
    close();
  });

  applyPredicate();

  function handleOutsidePointer(target) {
    if (popover.hidden) return;
    if (target.closest('.people-filter')) return;
    if (target.closest('.people-filter__popover')) return;
    close();
  }

  return {
    applyPredicate,
    close,
    handleOutsidePointer,
    refreshPeople,
    syncEmptyState,
  };
}
