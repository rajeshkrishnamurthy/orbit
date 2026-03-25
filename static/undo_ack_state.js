export function createUndoAckController({
  systemAckArea,
  undoWindowMs = 6000,
  getStripWidth,
  syncCanvasViewportRect,
  getTransport,
  mode,
  createPin,
  setPinState,
  applyDistanceStyle,
  isLensVisible,
  setActivePin,
  applyTouchResponse,
}) {
  let undoState = null;
  const completionTransitions = new Map();
  let systemAckState = null;

  function ackModeForWidth(width) {
    if (width < 900) return 'hidden';
    if (width < 1180) return 'compact';
    return 'full';
  }

  function clearSystemAck() {
    if (!systemAckState) return;
    clearTimeout(systemAckState.timer);
    systemAckState.el.remove();
    systemAckState = null;
    syncCanvasViewportRect();
  }

  function refreshAckMode() {
    if (!systemAckState || !systemAckState.el) return;
    systemAckState.el.dataset.ackMode = ackModeForWidth(getStripWidth());
  }

  function mountSystemAck(el, durationMs) {
    if (!systemAckArea) return;
    clearSystemAck();
    systemAckArea.appendChild(el);
    systemAckState = {
      el,
      timer: durationMs > 0 ? setTimeout(() => {
        clearSystemAck();
      }, durationMs) : null,
    };
    refreshAckMode();
    syncCanvasViewportRect();
  }

  function buildSystemAck({ kind, className, label, token, buttonLabel, onButton, durationMs = 0 }) {
    const el = document.createElement('div');
    el.className = `system-ack ${className}`;
    el.dataset.ackKind = kind;
    el.dataset.ackMode = 'full';
    el.innerHTML = `
      <span class="system-ack__label ${className}__label">${label}</span>
      <span class="system-ack__token ${className}__token" aria-hidden="true">${token || label}</span>
      ${buttonLabel ? `<button class="system-ack__action ${className}__action" type="button">${buttonLabel}</button>` : ''}
    `;
    const button = el.querySelector('button');
    if (button && typeof onButton === 'function') {
      button.addEventListener('click', async () => {
        const ok = await onButton();
        if (ok !== false) clearSystemAck();
      });
    }
    mountSystemAck(el, durationMs);
    return el;
  }

  function showCanvasWarning(message) {
    buildSystemAck({
      kind: 'warning',
      className: 'canvas-warning',
      label: message || 'Unable to complete action.',
      token: '!',
      durationMs: 2800,
    });
  }

  function clearUndo() {
    if (!undoState) return;
    if (undoState.kind === 'complete') {
      const transition = completionTransitions.get(undoState.id);
      if (transition) {
        clearTimeout(transition.exitTimer);
        completionTransitions.delete(undoState.id);
      }
    }
    clearTimeout(undoState.timer);
    undoState.el.remove();
    clearSystemAck();
    undoState = null;
  }

  function showUndoToast(message, kind, id, onUndo, durationMs = undoWindowMs) {
    clearUndo();
    const el = document.createElement('div');
    el.className = 'system-ack undo-toast';
    el.dataset.ackKind = kind;
    el.innerHTML = `
      <span class="undo-toast__label">${message}</span>
      <span class="undo-toast__token" aria-hidden="true">↺</span>
      <button class="undo-btn">Undo</button>
    `;
    const btn = el.querySelector('.undo-btn');
    btn.addEventListener('click', async () => {
      const ok = await onUndo();
      if (ok !== false) clearUndo();
    });
    mountSystemAck(el, 0);
    undoState = {
      id,
      kind,
      el,
      timer: setTimeout(() => {
        clearUndo();
      }, durationMs),
    };
  }

  function showDeleteUndo(payload) {
    showUndoToast('Deleted', 'delete', payload.id, async () => {
      let result;
      try {
        const transport = await getTransport();
        result = await transport.restoreDeleted({ mode, payload });
      } catch (_err) {
        result = {
          ok: false,
          error: mode === 'focus'
            ? 'Unable to restore deleted card. Please try again.'
            : 'Unable to restore deleted context. Please try again.',
        };
      }
      if (!result.ok) {
        showCanvasWarning(result.error || (mode === 'focus' ? 'Unable to restore deleted card.' : 'Unable to restore deleted context.'));
        return false;
      }
      createPin(payload, false, true);
      return true;
    });
  }

  function showTouchUndo(pin, payload) {
    showUndoToast('Touched', 'touch', payload.id, async () => {
      const transport = await getTransport();
      const result = await transport.undoTouchItem({ id: payload.id });
      if (!result.ok) {
        if (result.status == null) throw new Error(result.error || 'touch undo failed');
        showCanvasWarning(result.error || 'Unable to undo touch.');
        return false;
      }
      const data = result.data;
      if (data && data.undone === false) return false;
      applyTouchResponse(pin, data);
      return true;
    });
  }

  function handleCompleteSuccess(pin, payload) {
    setPinState(pin, 'completed');
    pin.dataset.transitioning = 'false';
    pin.classList.add('pin--complete-pop', 'pin--complete-pulse', 'pin--complete-smile');
    if (document.activeElement && pin.contains(document.activeElement)) document.activeElement.blur();
    const token = Symbol(payload.id);
    const exitTimer = setTimeout(() => {
      const current = completionTransitions.get(payload.id);
      if (!current || current.token !== token) return;
      setTimeout(() => {
        const latest = completionTransitions.get(payload.id);
        if (!latest || latest.token !== token) return;
        pin.classList.add('pin--complete-exit');
      }, 240);
      setTimeout(() => {
        const latest = completionTransitions.get(payload.id);
        if (!latest || latest.token !== token) return;
        pin.remove();
        latest.removed = true;
      }, 1220);
    }, 120);
    completionTransitions.set(payload.id, { token, exitTimer, removed: false });

    showUndoToast('Completed', 'complete', payload.id, async () => {
      const current = completionTransitions.get(payload.id);
      if (!current || current.token !== token) return false;
      const transport = await getTransport();
      const result = await transport.setItemCompleted({ id: payload.id, completed: false });
      if (!result.ok) {
        if (result.status == null) throw new Error(result.error || 'complete undo failed');
        showCanvasWarning(result.error || 'Unable to undo completion.');
        return false;
      }
      clearTimeout(current.exitTimer);
      completionTransitions.delete(payload.id);
      let restoredPin = pin;
      if (!pin.isConnected) {
        restoredPin = createPin(payload, false, true);
      }
      restoredPin.classList.remove('pin--complete-pop', 'pin--complete-pulse', 'pin--complete-smile', 'pin--complete-exit');
      const smile = restoredPin.querySelector('.pin-complete-smile');
      if (smile) smile.remove();
      setPinState(restoredPin, 'active');
      restoredPin.dataset.transitioning = 'false';
      applyDistanceStyle(restoredPin);
      restoredPin.style.display = isLensVisible(restoredPin) ? '' : 'none';
      setActivePin(restoredPin);
      return true;
    });
  }

  function showResurfaceAck() {
    buildSystemAck({
      kind: 'resurface',
      className: 'resurface-ack',
      label: 'Resurfaced',
      token: '↺',
      durationMs: 2400,
    });
  }

  return {
    handleCompleteSuccess,
    refreshAckMode,
    showCanvasWarning,
    showDeleteUndo,
    showResurfaceAck,
    showTouchUndo,
  };
}
