function fitNoteHeight(noteEl) {
  if (!noteEl) return;
  noteEl.style.height = 'auto';
  const h = Math.max(18, Math.min(noteEl.scrollHeight, 36));
  noteEl.style.height = h + 'px';
}

function escapedTitleValue(value) {
  return (value || '').replace(/"/g, '&quot;');
}

function escapedNoteValue(value) {
  return (value || '').replace(/</g, '&lt;');
}

export function createPinDomController({
  surface,
  mode,
  lensState,
  dragDropState,
  pinUi,
  pinActions,
}) {
  function bindPin(pin) {
    const drawerHost = pin.querySelector('.pin-action-host');
    const rightEdge = pin.querySelector('.pin-edge--right');
    const del = pin.querySelector('.pin-delete');
    const hide = pin.querySelector('.pin-hide');
    const slip = pin.querySelector('.pin-slip');
    const complete = pin.querySelector('.pin-complete');
    const touch = pin.querySelector('.pin-touch');
    if (rightEdge) {
      rightEdge.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      rightEdge.addEventListener('click', (ev) => ev.stopPropagation());
    }
    if (drawerHost) {
      drawerHost.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      drawerHost.addEventListener('click', (ev) => {
        if (!ev.target.closest('button')) ev.stopPropagation();
      });
    }
    if (slip) {
      slip.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      slip.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
        const on = pin.dataset.slipping !== 'true';
        pinUi.setSlipping(pin, on);
        pinActions.save(pin);
      });
    }
    if (hide) {
      hide.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      hide.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
        pinActions.hide(pin);
      });
    }
    if (complete) {
      complete.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      complete.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        pinActions.complete(pin);
      });
    }
    if (touch) {
      touch.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      touch.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        pinActions.touch(pin);
      });
    }
    const enter = pin.querySelector('.pin-enter');
    if (enter) {
      enter.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      enter.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (mode === 'contexts') location.href = '/?ctx=' + encodeURIComponent(pin.dataset.id);
      });
    }
    if (del) {
      del.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      del.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pin.dataset.saved !== 'true') {
          pin.classList.add('discarding');
          setTimeout(() => {
            if (pinUi.activePin() === pin) pinUi.setActive(null);
            pin.remove();
          }, 120);
          return;
        }
        pinActions.delete(pin);
      });
    }

    dragDropState.bindPinDrag(pin, pinUi.setActive);

    pin.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', () => {
        if (input.tagName === 'TEXTAREA') fitNoteHeight(input);
        pinUi.applyDistanceStyle(pin);
        pinActions.save(pin);
      });
      input.addEventListener('focus', () => pinUi.setActive(pin));
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          if (input.matches('.pin-title input')) {
            ev.preventDefault();
            const note = pin.querySelector('.pin-note textarea');
            note.focus();
            note.select();
            return;
          }
          if (input.matches('.pin-note textarea')) {
            ev.preventDefault();
            pinActions.save(pin);
            input.blur();
            return;
          }
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          if (pin.dataset.saved !== 'true') {
            pin.classList.add('discarding');
            setTimeout(() => {
              if (pinUi.activePin() === pin) pinUi.setActive(null);
              pin.remove();
            }, 120);
            return;
          }
          const titleInput = pin.querySelector('.pin-title input');
          const noteInput = pin.querySelector('.pin-note textarea');
          titleInput.value = pin.dataset.persistedTitle || '';
          noteInput.value = pin.dataset.persistedSubNote || '';
          fitNoteHeight(noteInput);
          pinUi.applyDistanceStyle(pin);
          input.blur();
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          const focusedInside = pin.contains(document.activeElement);
          if (!focusedInside) pinActions.discardIfEmpty(pin);
        }, 0);
      });
    });
  }

  function createPin(item, { focusTitle = false, markSaved = false } = {}) {
    const pin = document.createElement('article');
    pin.className = 'pin';
    pin.dataset.id = item.id;
    pin.dataset.mode = mode;
    pin.dataset.state = item.completed ? 'completed' : 'active';
    pin.dataset.transitioning = 'false';
    pin.dataset.touchedToday = item.touchedToday ? 'true' : 'false';
    pin.dataset.touchCount7d = String(Number(item.touchCount7d || 0));
    pin.dataset.lastTouchedDay = item.lastTouchedDay || '';
    pin.dataset.active = item.active ? 'true' : 'false';
    pin.dataset.stale = item.stale ? 'true' : 'false';
    pin.dataset.inCenter = item.inCenter ? 'true' : 'false';
    lensState.registerPin(item.id, markSaved);
    pin.dataset.saved = markSaved ? 'true' : 'false';
    pin.style.left = `${item.x}px`;
    pin.style.top = `${item.y}px`;
    const edgeTargets = '<span class="pin-edge pin-edge--top" aria-hidden="true"></span><span class="pin-edge pin-edge--right" aria-hidden="true"></span><span class="pin-edge pin-edge--bottom" aria-hidden="true"></span><span class="pin-edge pin-edge--left" aria-hidden="true"></span>';
    const enterBtn = mode === 'contexts' ? '<button class="pin-enter" aria-label="Enter context" title="Enter">→</button>' : '';
    const slipBtn = mode === 'focus' ? '<button class="pin-slip" aria-label="Slipping" title="Slipping">!</button>' : '';
    const actionDrawer = mode === 'focus' ? '<div class="pin-action-host"><span class="pin-action-affordance" aria-hidden="true">⋯</span><span class="pin-drawer-dim" aria-hidden="true"></span><div class="pin-action-drawer" role="group" aria-label="Card actions"><button class="pin-hide" aria-label="Minimize card" title="Minimize">–</button><button class="pin-delete" aria-label="Cancel card" title="Cancel">×</button><button class="pin-complete" aria-label="Complete card" title="Complete">✓</button></div></div><span class="pin-complete-smile" aria-hidden="true"></span><button class="pin-touch" aria-pressed="false" aria-label="Touch card" title="Touch card">◌</button>' : '';
    const deleteBtn = mode === 'contexts' ? '<button class="pin-delete" aria-label="Delete card" title="Delete">×</button>' : '';
    pin.innerHTML = `${edgeTargets}${actionDrawer}${enterBtn}${slipBtn}${deleteBtn}<label class="pin-title"><input value="${escapedTitleValue(item.title)}" /></label><label class="pin-note"><textarea rows="2">${escapedNoteValue(item.subNote)}</textarea></label>`;
    pin.dataset.persistedTitle = item.title || '';
    pin.dataset.persistedSubNote = item.subNote || '';
    surface.appendChild(pin);
    pinUi.setColor(pin, item.color || 'var(--c1)');
    pinUi.setSlipping(pin, !!item.slipping);
    pinUi.applyDistanceStyle(pin);
    bindPin(pin);
    pin.style.display = lensState.initialDisplayValue(pin, markSaved);
    fitNoteHeight(pin.querySelector('.pin-note textarea'));
    pinUi.setActive(pin);
    if (focusTitle) {
      const titleInput = pin.querySelector('.pin-title input');
      titleInput.focus();
      titleInput.select();
    }
    return pin;
  }

  return {
    createPin,
  };
}
