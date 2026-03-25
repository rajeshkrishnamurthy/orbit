export function createPinDestructiveController({
  mode,
  currentContextId,
  getTransport,
  readPinPayload,
  cancelPendingSave,
  showCanvasWarning,
  handleHideSuccess,
  forgetPin,
  clearActivePin,
  showDeleteUndo,
  contextDeleteConfirm,
}) {
  async function confirmContextDelete(name) {
    const {root, bodyEl, cancelEl, deleteEl} = contextDeleteConfirm || {};
    if (!root || !bodyEl || !cancelEl || !deleteEl) return false;
    return new Promise((resolve) => {
      const close = (ok) => {
        root.hidden = true;
        cancelEl.onclick = null;
        deleteEl.onclick = null;
        resolve(ok);
      };
      const label = (name && String(name).trim()) ? `"${String(name).trim()}"` : 'this context';
      bodyEl.textContent = `Delete ${label}? This will also delete all items inside this context.`;
      root.hidden = false;
      cancelEl.onclick = () => close(false);
      deleteEl.onclick = () => close(true);
    });
  }

  async function hidePinImmediate(pin) {
    if (pin.dataset.hidePending === 'true') return;
    cancelPendingSave(pin.dataset.id);
    pin.dataset.hidePending = 'true';
    try {
      const transport = await getTransport();
      const result = await transport.hideItem({id: pin.dataset.id, contextId: currentContextId});
      if (!result.ok) {
        transport.logMutationFailure({
          operation: 'hide-pin',
          id: pin.dataset.id,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error,
        });
        showCanvasWarning('Unable to hide card. Please try again.');
        return;
      }
      handleHideSuccess(result.data);
      forgetPin(pin.dataset.id);
      clearActivePin(pin);
      pin.remove();
    } catch (_err) {
      showCanvasWarning('Unable to hide card. Please try again.');
    } finally {
      if (pin.isConnected) {
        pin.dataset.hidePending = 'false';
      }
    }
  }

  async function deletePinImmediate(pin) {
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = readPinPayload(pin);

    if (mode === 'contexts') {
      const ok = await confirmContextDelete(payload.title);
      if (!ok) return;
    }

    cancelPendingSave(payload.id);

    try {
      const transport = await getTransport();
      const result = await transport.deleteEntity({mode, id: payload.id});
      if (!result.ok) {
        transport.logMutationFailure({
          operation: mode === 'focus' ? 'delete-pin' : 'delete-context',
          id: payload.id,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error,
        });
        if (mode === 'contexts' && result.warningMessage) {
          showCanvasWarning(result.warningMessage);
        }
        return;
      }
    } catch (_err) {
      if (mode === 'contexts') showCanvasWarning('Unable to delete context. Please try again.');
      return;
    }

    forgetPin(pin.dataset.id);
    clearActivePin(pin);
    pin.remove();
    if (mode === 'contexts') {
      location.reload();
      return;
    }
    if (mode === 'focus') showDeleteUndo(payload);
  }

  function discardIfEmpty(pin) {
    const title = pin.querySelector('.pin-title input').value.trim();
    const note = pin.querySelector('.pin-note textarea').value.trim();
    if (title || note) return;
    pin.classList.add('discarding');
    setTimeout(async () => {
      try {
        const transport = await getTransport();
        transport.deleteEntityFireAndForget({mode, id: pin.dataset.id, contextId: currentContextId});
      } catch (_err) {}
      clearActivePin(pin);
      pin.remove();
    }, 130);
  }

  return {
    deletePinImmediate,
    discardIfEmpty,
    hidePinImmediate,
  };
}
