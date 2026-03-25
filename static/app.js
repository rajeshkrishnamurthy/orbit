void (async () => {
  const [
    {createLensStateController},
    {createHiddenTrayController},
    {createDragDropController},
    {createPinDomController},
    {createMutationOrchestrator},
    {createPinPresenter},
    {createUndoAckController},
  ] = await Promise.all([
    import('/static/lens_state.js'),
    import('/static/hidden_tray_state.js'),
    import('/static/drag_drop_state.js'),
    import('/static/pin_dom.js'),
    import('/static/mutation_orchestrator.js'),
    import('/static/pin_presenter.js'),
    import('/static/undo_ack_state.js'),
  ]);
  const layoutShell = document.querySelector('.layout-shell') || document.body;
  const systemStrip = document.getElementById('system-strip');
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const systemAckArea = document.getElementById('system-ack-stack');
  const boundaryEl = document.createElement('div');
  boundaryEl.className = 'lens-boundary';
  surface.appendChild(boundaryEl);
  const items = window.__ITEMS__ || [];
  const mode = window.__MODE__ || 'focus';
  const currentContextId = window.__CURRENT_CONTEXT_ID__ || 'main-orbit';
  const centerSemantics = readCenterSemantics();
  let activePin = null;
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];
  let canvasViewportRect = null;
  let filtersPanel = null;
  let filtersTray = null;
  let swatchRail = null;
  let lensState = null;
  let hiddenTrayState = null;
  let dragDropState = null;
  let pinPresenter = null;

  function readCenterSemantics() {
    const candidates = [
      window.__CENTER_SEMANTICS__,
      window.__CENTER_PERIPHERY_SEMANTICS__,
      window.__CENTER_PERIPHERY_CONTRACT__,
      window.__DESKTOP_GEOMETRY__,
      window.__CENTER_BAND_GEOMETRY__,
    ];
    for (const value of candidates) {
      if (value && typeof value === 'object') return value;
    }
    return null;
  }

  function syncCanvasViewportRect(){
    const rect = surface.getBoundingClientRect();
    canvasViewportRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
    };
    window.canvasViewportRect = canvasViewportRect;
    return canvasViewportRect;
  }

  function getCanvasViewportRect(){
    return canvasViewportRect || syncCanvasViewportRect();
  }

  window.layoutBoundaryGuard = {
    canvasViewportRect: getCanvasViewportRect,
    containsPoint(x, y){
      const rect = getCanvasViewportRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },
  };
  syncCanvasViewportRect();

  toolbar.innerHTML = '';
  const colorsPanel = document.createElement('div');
  colorsPanel.className = 'toolbar__colors';
  const cardColorLabel = document.createElement('span');
  cardColorLabel.className = 'toolbar__label';
  cardColorLabel.textContent = 'Card color';
  swatchRail = document.createElement('div');
  swatchRail.className = 'toolbar__swatches';
  filtersTray = document.createElement('div');
  filtersTray.className = 'filters-tray';
  filtersPanel = document.createElement('div');
  filtersPanel.className = 'filters-tray__panel';
  filtersPanel.id = 'filters-panel';
  filtersPanel.hidden = false;
  const filtersControls = document.createElement('div');
  filtersControls.className = 'filters-tray__controls';
  filtersPanel.appendChild(filtersControls);
  filtersTray.append(filtersPanel);
  colorsPanel.append(cardColorLabel, swatchRail);
  toolbar.append(colorsPanel, filtersTray);
  const contextNameEl = document.getElementById('context-name');
  const openContextsEl = document.getElementById('open-contexts');
  const initialContextTitle = contextNameEl ? ((contextNameEl.textContent || '').trim() || 'Main Orbit') : 'Main Orbit';
  let mutationTransportPromise = null;
  function getMutationTransport(){
    if (!mutationTransportPromise) {
      mutationTransportPromise = import('/static/mutation_transport.js')
        .then((mod) => mod.createMutationTransport({fetchImpl: window.fetch.bind(window)}));
    }
    return mutationTransportPromise;
  }
  pinPresenter = createPinPresenter({
    documentRef: document,
    mode,
  });
  const applyTouchResponse = (...args) => pinPresenter.applyTouchResponse(...args);
  const mutationOrchestrator = createMutationOrchestrator({
    mode,
    currentContextId,
    initialContextTitle,
    getTransport: getMutationTransport,
    showCanvasWarning,
    readPinPayload: pinPayload,
    markPersisted,
    applyTouchResponse,
  });
  async function persistContextTitle(){
    return mutationOrchestrator.persistContextTitle(contextNameEl);
  }
  if (mode === 'focus' && contextNameEl) {
    contextNameEl.contentEditable = 'true';
    contextNameEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    contextNameEl.addEventListener('click', () => {
      contextNameEl.focus();
      const r = document.createRange();
      r.selectNodeContents(contextNameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    });
    contextNameEl.addEventListener('blur', () => { persistContextTitle(); });
  }
  if (openContextsEl) {
    openContextsEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    if (mode === 'focus') {
      openContextsEl.hidden = false;
      openContextsEl.onclick = () => { location.href = '/?canvas=contexts&ctx=' + encodeURIComponent(currentContextId); };
    } else {
      openContextsEl.hidden = true;
    }
  }

  palette.forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.dataset.color = c;
    b.style.background = c;
    b.onclick = () => {
      if (!activePin) return;
      setPinColor(activePin, c);
      savePin(activePin);
      refreshSwatches();
    };
    swatchRail.appendChild(b);
  });

  const contextConfirm = document.createElement('div');
  contextConfirm.className = 'context-confirm';
  contextConfirm.hidden = true;
  contextConfirm.innerHTML = '<div class="context-confirm__panel"><div class="context-confirm__title">Delete context?</div><div class="context-confirm__body" id="context-confirm-body">This will also delete all items inside this context.</div><div class="context-confirm__actions"><button type="button" class="context-confirm__btn context-confirm__btn--ghost" id="context-confirm-cancel">Cancel</button><button type="button" class="context-confirm__btn context-confirm__btn--danger" id="context-confirm-delete">Delete</button></div></div>';
  layoutShell.appendChild(contextConfirm);
  const contextConfirmBodyEl = contextConfirm.querySelector('#context-confirm-body');
  const contextConfirmCancelEl = contextConfirm.querySelector('#context-confirm-cancel');
  const contextConfirmDeleteEl = contextConfirm.querySelector('#context-confirm-delete');
  contextConfirm.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  contextConfirm.addEventListener('click', (ev) => ev.stopPropagation());

  function confirmContextDelete(name){
    return new Promise((resolve) => {
      const close = (ok) => {
        contextConfirm.hidden = true;
        contextConfirmCancelEl.onclick = null;
        contextConfirmDeleteEl.onclick = null;
        resolve(ok);
      };
      const label = (name && String(name).trim()) ? `"${String(name).trim()}"` : 'this context';
      contextConfirmBodyEl.textContent = `Delete ${label}? This will also delete all items inside this context.`;
      contextConfirm.hidden = false;
      contextConfirmCancelEl.onclick = () => close(false);
      contextConfirmDeleteEl.onclick = () => close(true);
    });
  }

  function stripWidth(){
    return (systemStrip || layoutShell).getBoundingClientRect().width;
  }

  lensState = createLensStateController({
    surface,
    boundaryEl,
    filtersControls,
    mode,
    centerSemantics,
    syncCanvasViewportRect,
  });

  hiddenTrayState = createHiddenTrayController({
    layoutShell,
    systemStrip,
    filtersControls,
    mode,
    currentContextId,
    initialHiddenCount: window.__HIDDEN_COUNT__ || 0,
    getMutationTransport,
    syncCanvasViewportRect,
  });

  dragDropState = createDragDropController({
    surface,
    mode,
    dragThresholdPx: 5,
  });

  const undoAckController = createUndoAckController({
    systemAckArea,
    undoWindowMs: 6000,
    getStripWidth: stripWidth,
    syncCanvasViewportRect,
    getTransport: getMutationTransport,
    mode,
    createPin,
    setPinState,
    applyDistanceStyle,
    isLensVisible,
    setActivePin,
    applyTouchResponse,
  });

  const pinDomController = createPinDomController({
    surface,
    mode,
    lensState,
    dragDropState,
    pinUi: {
      activePin: () => activePin,
      setActive: setActivePin,
      setColor: setPinColor,
      setSlipping,
      setDragHalo,
      applyDistanceStyle,
    },
    pinActions: {
      save: savePin,
      hide: hidePinImmediate,
      delete: deletePinImmediate,
      touch: touchPinImmediate,
      complete: completePinImmediate,
      discardIfEmpty,
    },
  });

  function showCanvasWarning(message){
    undoAckController.showCanvasWarning(message);
  }

  function placeHiddenTray(){
    hiddenTrayState.repositionIfOpen();
  }

  function captureStaleLensSnapshot(){
    lensState.captureStaleSnapshot();
  }

  function renderLensButtons(){
    lensState.renderButtons();
  }

  function isLensVisible(pin){
    return lensState.isVisible(pin);
  }

  function applyLens(){
    lensState.applyLens();
  }

  function applyDistanceStyle(pin){
    lensState.applyDistanceStyle(pin);
    pinPresenter.syncTouchState(pin);
  }

  function setDragHalo(active){
    lensState.setDragHalo(active);
  }

  function closeHiddenTray(){
    hiddenTrayState.close();
  }

  function renderHiddenButton(){
    hiddenTrayState.renderButton();
  }

  function setActivePin(pin){
    activePin = pin;
    surface.querySelectorAll('.pin').forEach(p => p.classList.toggle('selected', p === pin));
    refreshSwatches();
  }

  function setSlipping(pin, on){
    pin.dataset.slipping = on ? "true" : "false";
    pin.classList.toggle("slipping", on);
  }

  function setPinColor(pin, color){
    pinPresenter.setPinColor(pin, color);
  }

  function refreshSwatches(){
    document.querySelectorAll('.sw').forEach(sw => {
      sw.classList.toggle('active', activePin && activePin.dataset.color === sw.dataset.color);
    });
  }

  function uid(){ return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  function selectedPaletteColor(){
    const activeSw = document.querySelector('.sw.active');
    if (activeSw && activeSw.dataset.color) return activeSw.dataset.color;
    if (activePin && activePin.dataset.color) return activePin.dataset.color;
    return 'var(--c1)';
  }

  function markPersisted(pin){
    pin.dataset.persistedTitle = pin.querySelector('.pin-title input').value;
    pin.dataset.persistedSubNote = pin.querySelector('.pin-note textarea').value;
  }
  function cancelPendingSave(id){
    mutationOrchestrator.cancelPendingSave(id);
  }
  function pinPayload(pin){
    return {
      id: pin.dataset.id,
      contextId: currentContextId,
      title: pin.querySelector('.pin-title input').value,
      subNote: pin.querySelector('.pin-note textarea').value,
      x: parseFloat(pin.style.left) || 0,
      y: parseFloat(pin.style.top) || 0,
      color: pin.dataset.color || 'var(--c1)',
      slipping: pin.dataset.slipping === 'true',
      completed: pin.dataset.state === 'completed'
    };
  }
  function setPinState(pin, state){
    pin.dataset.state = state;
    if (state !== 'active' && activePin === pin) setActivePin(null);
  }
  function savePin(pin){
    mutationOrchestrator.savePin(pin);
  }

  async function hidePinImmediate(pin){
    if (pin.dataset.hidePending === 'true') return;
    cancelPendingSave(pin.dataset.id);
    pin.dataset.hidePending = 'true';
    try {
      const transport = await getMutationTransport();
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
      const d = result.data;
      hiddenTrayState.handleHideSuccess(d);
      lensState.forgetPin(pin.dataset.id);
      if (activePin === pin) setActivePin(null);
      pin.remove();
      return;
    } catch (_err) {
      showCanvasWarning('Unable to hide card. Please try again.');
    } finally {
      if (pin.isConnected) {
        pin.dataset.hidePending = 'false';
      }
    }
  }

  async function deletePinImmediate(pin){
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = pinPayload(pin);

    if (mode === 'contexts') {
      const ok = await confirmContextDelete(payload.title);
      if (!ok) return;
    }

    // Prevent pending autosave from recreating a just-deleted card/context.
    cancelPendingSave(payload.id);

    try {
      const transport = await getMutationTransport();
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

    lensState.forgetPin(pin.dataset.id);
    if (activePin === pin) setActivePin(null);
    pin.remove();
    if (mode === 'contexts') {
      location.reload();
      return;
    }
    if (mode === 'focus') showDeleteUndo(payload);
  }

  function showDeleteUndo(payload){
    undoAckController.showDeleteUndo(payload);
  }

  function showResurfaceAck(){
    undoAckController.showResurfaceAck();
  }

  function showTouchUndo(pin, payload){
    undoAckController.showTouchUndo(pin, payload);
  }

  async function touchPinImmediate(pin){
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
    const payload = pinPayload(pin);
    try {
      const transport = await getMutationTransport();
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

  async function completePinImmediate(pin){
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = pinPayload(pin);
    pin.dataset.transitioning = 'true';
    cancelPendingSave(payload.id);
    try {
      const transport = await getMutationTransport();
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
    undoAckController.handleCompleteSuccess(pin, payload);
  }

  function discardIfEmpty(pin){
    const title = pin.querySelector('.pin-title input').value.trim();
    const note = pin.querySelector('.pin-note textarea').value.trim();
    if (title || note) return;
    pin.classList.add('discarding');
    setTimeout(async () => {
      try {
        const transport = await getMutationTransport();
        transport.deleteEntityFireAndForget({mode, id: pin.dataset.id, contextId: currentContextId});
      } catch (_err) {}
      if (activePin === pin) setActivePin(null);
      pin.remove();
    }, 130);
  }

  function createPin(item, focusTitle = false, markSaved = false){
    return pinDomController.createPin(item, {focusTitle, markSaved});
  }

  items.forEach((item) => createPin(item, false, true));
  surface.addEventListener('dragover', (event) => {
    hiddenTrayState.handleSurfaceDragOver(event, {setDragHalo});
  });

  surface.addEventListener('dragleave', (event) => {
    hiddenTrayState.handleSurfaceDragLeave(event, {surface, setDragHalo});
  });

  surface.addEventListener('drop', (event) => {
    void hiddenTrayState.handleSurfaceDrop(event, {
      surface,
      setDragHalo,
      getCanvasViewportRect,
      createPin,
      showCanvasWarning,
      showResurfaceAck,
    });
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ev.defaultPrevented) return;
    if (!hiddenTrayState.isOpen()) return;
    closeHiddenTray();
  });

  document.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.closest('.hidden-tray') || target.closest('#hidden-toggle') || target.closest('.context-confirm')) return;
    if (target.closest('.sw')) {
      closeHiddenTray();
      return;
    }
    if (target.closest('.filters-tray')) return;
    if (surface.contains(target)) return;
    closeHiddenTray();
  });

  surface.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const outsideTrayClick = hiddenTrayState.isOpen() && !target.closest('.hidden-tray') && !target.closest('#hidden-toggle');
    if (outsideTrayClick) closeHiddenTray();
    if (target.closest('.pin') || target.closest('.toolbar') || target.closest('.hint') || target.closest('.undo-toast') || target.closest('.context-head') || target.closest('.hidden-tray') || target.closest('.context-confirm')) return;
    if (outsideTrayClick) return;
    const rect = getCanvasViewportRect();
    const x = Math.max(6, Math.min(rect.width - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(rect.height - 90, e.clientY - rect.top));
    createPin({id: uid(), title: '', subNote: '', x, y, color: selectedPaletteColor(), slipping: false}, true, false);
    e.preventDefault();
  });

  if (surface.querySelector('.pin')) setActivePin(surface.querySelector('.pin'));
  renderHiddenButton();
  if (lensState.getMode() === 'stale') captureStaleLensSnapshot();
  renderLensButtons();
  syncCanvasViewportRect();
  applyLens();

  window.addEventListener('resize', () => {
    syncCanvasViewportRect();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    lensState.updateBoundaryCue(false);
    undoAckController.refreshAckMode();
    placeHiddenTray();
  });
})().catch((err) => {
  console.error(err);
});
