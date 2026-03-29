const OPTIONS = [
  { id: 'skip', label: 'Skip snooze', days: null },
  { id: '1d', label: '1 day', days: 1 },
  { id: '3d', label: '3 days', days: 3 },
  { id: '7d', label: '7 days', days: 7 },
];

const DEFAULT_ID = '3d';

export function createHideSnoozeChoiceController({
  layoutShell,
  mode,
  onChoose,
  syncCanvasViewportRect,
}) {
  let panel = null;
  let selectedID = DEFAULT_ID;
  let currentPin = null;
  let currentAnchorEl = null;
  let chooseInFlight = false;

  function selectedOption() {
    return OPTIONS.find((option) => option.id === selectedID) || OPTIONS[0];
  }

  function close() {
    if (!panel) return;
    panel.remove();
    panel = null;
    currentPin = null;
    currentAnchorEl = null;
    chooseInFlight = false;
    syncCanvasViewportRect();
  }

  function chooseSnoozeUntil(option) {
    if (option.days == null) return null;
    const now = Date.now();
    const ms = option.days * 24 * 60 * 60 * 1000;
    return new Date(now + ms).toISOString();
  }

  function setSelected(nextID) {
    selectedID = nextID;
    if (!panel) return;
    panel.querySelectorAll('.hide-snooze-chooser__option').forEach((button) => {
      const active = button.dataset.optionId === selectedID;
      button.dataset.selected = active ? 'true' : 'false';
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function moveSelection(direction) {
    const currentIndex = OPTIONS.findIndex((option) => option.id === selectedID);
    const base = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (base + direction + OPTIONS.length) % OPTIONS.length;
    setSelected(OPTIONS[nextIndex].id);
  }

  async function confirmSelection() {
    if (!currentPin || chooseInFlight) return;
    chooseInFlight = true;
    const option = selectedOption();
    const snoozeUntil = chooseSnoozeUntil(option);
    try {
      await onChoose(currentPin, { snoozeUntil });
    } finally {
      close();
    }
  }

  function handleKeydown(event) {
    if (!panel) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      void confirmSelection();
    }
  }

  function place(anchorEl) {
    if (!panel || !anchorEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const shellRect = layoutShell.getBoundingClientRect();
    const width = 252;
    const left = Math.max(8, Math.min(layoutShell.clientWidth - width - 8, (anchorRect.left - shellRect.left) - width + 24));
    const top = Math.max(8, Math.min(layoutShell.clientHeight - 92, (anchorRect.bottom - shellRect.top) + 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function open(pin, { anchorEl } = {}) {
    if (mode !== 'focus' || !pin) return;
    close();
    currentPin = pin;
    currentAnchorEl = anchorEl || null;
    selectedID = DEFAULT_ID;

    panel = document.createElement('div');
    panel.className = 'hide-snooze-chooser';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Hide snooze options');
    panel.tabIndex = -1;
    panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    panel.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target ? target.closest('.hide-snooze-chooser__option') : null;
      if (!button) return;
      const optionID = button.dataset.optionId;
      if (!optionID) return;
      setSelected(optionID);
      void confirmSelection();
    });

    OPTIONS.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hide-snooze-chooser__option';
      button.dataset.optionId = option.id;
      button.textContent = option.label;
      panel.appendChild(button);
    });

    layoutShell.appendChild(panel);
    setSelected(DEFAULT_ID);
    place(currentAnchorEl);
    panel.focus();
    syncCanvasViewportRect();
  }

  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('resize', () => {
    if (!panel) return;
    place(currentAnchorEl);
  });

  return {
    close,
    open,
  };
}
