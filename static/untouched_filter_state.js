const STORAGE_KEY = 'orbit.untouched-filter-active';

export function createUntouchedFilterController({ documentRef, filtersControls, mode, lensState }) {
  if (mode !== 'focus') {
    return {
      applyPredicate: () => {},
      isActive: () => false,
      setActive: () => {},
      syncFromLensState: () => {},
    };
  }

  const pill = documentRef.createElement('button');
  pill.type = 'button';
  pill.className = 'untouched-filter__pill';
  pill.textContent = 'Untouched';
  filtersControls.appendChild(pill);

  let active = readStoredActive();

  function readStoredActive() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'true';
    } catch (_err) {
      return false;
    }
  }

  function persistActive() {
    try {
      if (active) sessionStorage.setItem(STORAGE_KEY, 'true');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_err) {}
  }

  function matchesUntouched(pin) {
    return pin.dataset.touchedToday !== 'true';
  }

  function applyPredicate() {
    lensState.setAdditionalVisibilityPredicate('untouched', active ? matchesUntouched : null);
    pill.classList.toggle('active', active);
  }

  function setActive(nextActive) {
    active = !!nextActive;
    persistActive();
    applyPredicate();
  }

  function syncFromLensState() {
    if (lensState.getMode() !== 'stale') return;
    if (!active) return;
    active = false;
    persistActive();
    applyPredicate();
  }

  pill.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const shouldActivate = !active;
    if (shouldActivate && lensState.getMode() === 'stale') {
      const staleBtn = documentRef.querySelector('.lens-btn[data-lens="stale"]');
      if (staleBtn instanceof HTMLElement) staleBtn.click();
    }
    setActive(shouldActivate);
  });

  applyPredicate();

  return {
    applyPredicate,
    isActive: () => active,
    setActive,
    syncFromLensState,
  };
}
