export function createPinTouchCompleteController({
  runtime,
  touchEffects,
  completeEffects,
}) {
  const {
    mode,
    currentContextId,
    getTransport,
    readPinPayload,
    cancelPendingSave,
    showCanvasWarning,
  } = runtime;
  const {applyTouchResponse, showTouchUndo} = touchEffects;
  const {handleCompleteSuccess} = completeEffects;

  async function touchPinImmediate(pin) {
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
    const payload = readPinPayload(pin);
    try {
      const transport = await getTransport();
      const result = await transport.touchItem({id: payload.id});
      if (!result.ok) {
        transport.logMutationFailure({
          operation: 'touch-pin',
          id: payload.id,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error || `touch failed (${result.status})`,
        });
        if (result.status == null) showCanvasWarning('Unable to touch card. Please try again.');
        else showCanvasWarning(result.error || 'Unable to touch card.');
        return;
      }
      const data = result.data;
      applyTouchResponse(pin, data);
      if (data.touched) showTouchUndo(pin, payload);
    } catch (_err) {
      showCanvasWarning('Unable to touch card. Please try again.');
    }
  }

  async function completePinImmediate(pin) {
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = readPinPayload(pin);
    pin.dataset.transitioning = 'true';
    cancelPendingSave(payload.id);
    try {
      const transport = await getTransport();
      const result = await transport.setItemCompleted({id: payload.id, completed: true});
      if (!result.ok) {
        pin.dataset.transitioning = 'false';
        transport.logMutationFailure({
          operation: 'complete-pin',
          id: payload.id,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error || `complete failed (${result.status})`,
        });
        if (result.status == null) showCanvasWarning('Unable to complete card. Please try again.');
        else showCanvasWarning(result.error || 'Unable to complete card.');
        return;
      }
    } catch (_err) {
      pin.dataset.transitioning = 'false';
      showCanvasWarning('Unable to complete card. Please try again.');
      return;
    }
    handleCompleteSuccess(pin, payload);
  }

  return {
    completePinImmediate,
    touchPinImmediate,
  };
}
