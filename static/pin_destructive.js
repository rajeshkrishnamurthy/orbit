export function createPinDestructiveController({runtime, effects}) {
  const {
    mode,
    currentContextId,
    getTransport,
    readPinPayload,
    cancelPendingSave,
    showCanvasWarning,
  } = runtime;
  const {
    confirmContextDelete,
    handleHideSuccess,
    handleDeleteSuccess,
    handleDiscardRemove,
  } = effects;

  async function hidePinImmediate(pin, { snoozeUntil } = {}) {
    if (pin.dataset.hidePending === 'true') return;
    cancelPendingSave(pin.dataset.id);
    pin.dataset.hidePending = 'true';
    try {
      const transport = await getTransport();
      let result;
      if (snoozeUntil) {
        result = await transport.hideItem({id: pin.dataset.id, contextId: currentContextId, snoozeUntil});
      } else {
        result = await transport.hideItem({id: pin.dataset.id, contextId: currentContextId});
      }
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
      handleHideSuccess(result.data, pin);
    } catch (_err) {
      showCanvasWarning('Unable to hide card. Please try again.');
    } finally {
      if (pin.isConnected) pin.dataset.hidePending = 'false';
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

    handleDeleteSuccess(pin, payload);
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
      handleDiscardRemove(pin);
    }, 130);
  }

  return {
    deletePinImmediate,
    discardIfEmpty,
    hidePinImmediate,
  };
}
