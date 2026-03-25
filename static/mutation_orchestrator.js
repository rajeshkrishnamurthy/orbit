export function createMutationOrchestrator({
  mode,
  currentContextId,
  initialContextTitle,
  getTransport,
  showCanvasWarning,
  readPinPayload,
  markPersisted,
  applyTouchResponse,
}) {
  let contextTitlePersisted = initialContextTitle;
  let contextTitleSaveSeq = 0;
  const pending = new Map();
  const saveRequestSeq = new Map();

  function cancelPendingSave(id) {
    clearTimeout(pending.get(id));
    pending.delete(id);
  }

  async function persistContextTitle(contextNameEl) {
    if (!contextNameEl) return;
    const nextTitle = (contextNameEl.textContent || '').trim() || 'Main Orbit';
    contextNameEl.textContent = nextTitle;
    const previousTitle = contextTitlePersisted;
    if (nextTitle === previousTitle) return;
    const saveSeq = ++contextTitleSaveSeq;
    try {
      const transport = await getTransport();
      const result = await transport.saveContextTitle({ contextId: currentContextId, title: nextTitle });
      if (saveSeq !== contextTitleSaveSeq) return;
      if (!result.ok) {
        transport.logMutationFailure({
          operation: 'context-title-save',
          id: currentContextId,
          contextId: currentContextId,
          endpoint: result.endpoint,
          status: result.status,
          error: result.error,
        });
        contextNameEl.textContent = previousTitle;
        showCanvasWarning('Unable to save context title. Restored previous value.');
        return;
      }
      contextTitlePersisted = nextTitle;
    } catch (_err) {
      if (saveSeq !== contextTitleSaveSeq) return;
      contextNameEl.textContent = previousTitle;
      showCanvasWarning('Unable to save context title. Restored previous value.');
    }
  }

  function savePin(pin) {
    if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
    const id = pin.dataset.id;
    const payload = readPinPayload(pin);
    cancelPendingSave(id);
    pending.set(id, setTimeout(async () => {
      const saveSeq = (saveRequestSeq.get(id) || 0) + 1;
      saveRequestSeq.set(id, saveSeq);
      try {
        const transport = await getTransport();
        const result = await transport.saveModeEntity({ mode, payload });
        if (saveRequestSeq.get(id) !== saveSeq) return;
        if (!result.ok) {
          transport.logMutationFailure({
            operation: mode === 'focus' ? 'save-pin' : 'save-context-card',
            id,
            contextId: currentContextId,
            endpoint: result.endpoint,
            status: result.status,
            error: result.error,
          });
          pin.dataset.saved = 'false';
          showCanvasWarning(mode === 'focus' ? 'Unable to save card changes. Your edits are kept locally.' : 'Unable to save context changes. Your edits are kept locally.');
          return;
        }
        const data = result.data;
        if (saveRequestSeq.get(id) !== saveSeq) return;
        if (data) applyTouchResponse(pin, data);
        pin.dataset.saved = 'true';
        markPersisted(pin);
      } catch (_err) {
        if (saveRequestSeq.get(id) !== saveSeq) return;
        pin.dataset.saved = 'false';
        showCanvasWarning(mode === 'focus' ? 'Unable to save card changes. Your edits are kept locally.' : 'Unable to save context changes. Your edits are kept locally.');
      }
    }, 180));
  }

  return {
    cancelPendingSave,
    persistContextTitle,
    savePin,
  };
}
