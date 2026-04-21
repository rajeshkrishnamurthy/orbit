void (async () => {
  const [
    {createLensStateController},
    {createHiddenTrayController},
    {createDragDropController},
    {createPinDomController},
    {createMutationOrchestrator},
    {createPinDestructiveController},
    {createPinPresenter},
    {createPinActivityLogController},
    {createPinTouchCompleteController},
    {createUndoAckController},
    {createResurfaceShelfController},
    {createHideSnoozeChoiceController},
    {createChromeContextStripController},
    {createPinPeopleController}, {createPeopleFilterController}, {createUntouchedFilterController},
  ] = await Promise.all([
    import('/static/lens_state.js'),
    import('/static/hidden_tray_state.js'),
    import('/static/drag_drop_state.js'),
    import('/static/pin_dom.js'),
    import('/static/mutation_orchestrator.js'),
    import('/static/pin_destructive.js'),
    import('/static/pin_presenter.js'),
    import('/static/pin_activity_log_state.js'),
    import('/static/pin_touch_complete.js'),
    import('/static/undo_ack_state.js'),
    import('/static/resurface_shelf_state.js'),
    import('/static/hide_snooze_choice_state.js'),
    import('/static/chrome_context_strip.js'), import('/static/pin_people_state.js'), import('/static/people_filter_state.js'), import('/static/untouched_filter_state.js'),
  ]);
  const layoutShell = document.querySelector('.layout-shell') || document.body;
  const systemStrip = document.getElementById('system-strip');
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const chromeContextStripEl = document.getElementById('chrome-context-strip');
  const systemAckArea = document.getElementById('system-ack-stack');
  const resurfaceShelf = document.getElementById('resurface-shelf');
  const boundaryEl = document.createElement('div');
  boundaryEl.className = 'lens-boundary';
  surface.appendChild(boundaryEl);
  const items = window.__ITEMS__ || [];
  const resurfacedItems = window.__RESURFACED_ITEMS__ || [];
  const initialContextStripEntries = window.__CONTEXT_STRIP_ENTRIES__ || [];
  const initialPeople = window.__PEOPLE__ || [];
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
  let pinActivityLogState = null;
  let resurfaceShelfState = null;
  let hideSnoozeChoiceState = null;
  let chromeContextStripState = null; let pinPeopleState = null; let peopleFilterState = null; let untouchedFilterState = null;

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
  toolbar.innerHTML = ''; const colorsPanel = document.createElement('div');
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
  const makeGroup = (name) => Object.assign(document.createElement('div'), { className: `filters-group filters-group--${name}` });
  const makeSep = () => Object.assign(document.createElement('span'), { className: 'filters-group-separator', ariaHidden: 'true' });
  const utilityGroup = makeGroup('utility'), scopeGroup = makeGroup('scope'), stateGroup = makeGroup('state'), peopleGroup = makeGroup('people');
  filtersControls.append(utilityGroup, makeSep(), scopeGroup, makeSep(), stateGroup, makeSep(), peopleGroup);
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

  function navigateToContext(targetContextId) {
    const id = (targetContextId || '').trim();
    if (!id || id === currentContextId) return;
    location.href = '/?ctx=' + encodeURIComponent(id);
  }

  async function refreshChromeContextStrip() {
    if (!chromeContextStripState || mode !== 'focus') return;
    await chromeContextStripState.refresh();
  }

  chromeContextStripState = createChromeContextStripController({
    documentRef: document,
    container: chromeContextStripEl,
    mode,
    activeContextId: currentContextId,
    initialEntries: initialContextStripEntries,
    getTransport: getMutationTransport,
    onNavigate: navigateToContext,
  });

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
    const result = await mutationOrchestrator.persistContextTitle(contextNameEl);
    await refreshChromeContextStrip();
    return result;
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
    scopeControls: scopeGroup,
    stateControls: stateGroup,
    mode,
    centerSemantics,
    syncCanvasViewportRect,
  });
  untouchedFilterState = createUntouchedFilterController({documentRef: document, filtersControls: stateGroup, mode, lensState});
  pinPeopleState = createPinPeopleController({documentRef: document, layoutShell, surface, getTransport: getMutationTransport, showCanvasWarning, closeActivityLogPopover, savePin, onPeopleUpdated(people) { if (peopleFilterState && typeof peopleFilterState.refreshPeople === 'function') void peopleFilterState.refreshPeople(people); }});
  peopleFilterState = createPeopleFilterController({documentRef: document, layoutShell, filtersControls: peopleGroup, surface, mode, getTransport: getMutationTransport, lensState, initialPeople, showCanvasWarning});

  hiddenTrayState = createHiddenTrayController({
    layoutShell,
    systemStrip,
    filtersControls: utilityGroup,
    mode,
    currentContextId,
    initialHiddenCount: window.__HIDDEN_COUNT__ || 0,
    initialResurfacedCount: Array.isArray(resurfacedItems) ? resurfacedItems.length : 0,
    getMutationTransport,
    syncCanvasViewportRect,
  });

  if (resurfaceShelf) {
    resurfaceShelfState = createResurfaceShelfController({
      container: resurfaceShelf,
      initialItems: resurfacedItems,
      mode,
      currentContextId,
      getMutationTransport,
    });
  }

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
  const pinMutationRuntime = {
    mode,
    currentContextId,
    getTransport: getMutationTransport,
    readPinPayload: pinPayload,
    cancelPendingSave,
    showCanvasWarning,
  };
  const pinDestructiveController = createPinDestructiveController({
    runtime: pinMutationRuntime,
    effects: {
      confirmContextDelete,
      handleHideSuccess(data, pin) {
        hiddenTrayState.handleHideSuccess(data);
        lensState.forgetPin(pin.dataset.id);
        if (activePin === pin) setActivePin(null);
        pin.remove();
        void refreshChromeContextStrip();
      },
      handleDeleteSuccess(pin, payload) {
        lensState.forgetPin(pin.dataset.id);
        if (activePin === pin) setActivePin(null);
        pin.remove();
        if (mode === 'contexts') {
          location.reload();
          return;
        }
        if (mode === 'focus') undoAckController.showDeleteUndo(payload);
        void refreshChromeContextStrip();
      },
      handleDiscardRemove(pin) {
        if (activePin === pin) setActivePin(null);
        pin.remove();
      },
    },
  });
  const pinTouchCompleteController = createPinTouchCompleteController({
    runtime: pinMutationRuntime,
    touchEffects: {
      applyTouchResponse,
      showTouchUndo: undoAckController.showTouchUndo,
      onTouchCommitted: refreshChromeContextStrip,
    },
    completeEffects: {
      handleCompleteSuccess: undoAckController.handleCompleteSuccess,
      onCompleteCommitted: refreshChromeContextStrip,
    },
    activityLogEffects: {
      openAfterEffectiveTouch(pin, { anchorEl } = {}) {
        if (!pinActivityLogState) return;
        const id = (pin?.dataset?.id || '').trim();
        if (!id) return;
        if (pinActivityLogState.isOpenForItem(id)) return;
        pinActivityLogState.open(pin, { anchorEl });
      },
    },
  });
  pinActivityLogState = createPinActivityLogController({
    layoutShell,
    mode,
    getMutationTransport,
    syncCanvasViewportRect,
    showCanvasWarning,
  });

  hideSnoozeChoiceState = createHideSnoozeChoiceController({
    layoutShell,
    mode,
    syncCanvasViewportRect,
    async onChoose(pin, { snoozeUntil }) {
      await pinDestructiveController.hidePinImmediate(pin, { snoozeUntil });
    },
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
      hide(pin, options) {
        hideSnoozeChoiceState.open(pin, options);
      },
      delete: pinDestructiveController.deletePinImmediate,
      activityLog(pin, options) { if (pinPeopleState) pinPeopleState.close(); pinActivityLogState.open(pin, options); },
      people(pin, options) { if (pinPeopleState) pinPeopleState.open(pin, options); },
      touch: pinTouchCompleteController.touchPinImmediate,
      complete: pinTouchCompleteController.completePinImmediate,
      discardIfEmpty: pinDestructiveController.discardIfEmpty,
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
    if (untouchedFilterState) untouchedFilterState.syncFromLensState();
    lensState.applyLens();
    if (peopleFilterState) peopleFilterState.syncEmptyState();
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

  function closeActivityLogPopover() {
    if (!pinActivityLogState) return;
    pinActivityLogState.close();
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
      personIds: pinPeopleState ? pinPeopleState.readPinPersonIDs(pin) : [],
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

  let foregroundRefreshInFlight = false;
  async function runForegroundRefreshPass(){
    if (mode !== 'focus') return;
    if (foregroundRefreshInFlight) return;
    if (document.hidden) return;
    foregroundRefreshInFlight = true;
    try {
      const transport = await getMutationTransport();
      const result = await transport.refreshForeground({ contextId: currentContextId });
      if (!result || !result.ok || !result.data || !Array.isArray(result.data.items)) return;
      for (const item of result.data.items) {
        if (!item || !item.id) continue;
        const pin = surface.querySelector(`.pin[data-id="${item.id}"]`);
        if (!pin) continue;
        applyTouchResponse(pin, item);
      }
      applyLens();
      if (hiddenTrayState && typeof hiddenTrayState.recomputeCounts === 'function') {
        await hiddenTrayState.recomputeCounts({ runDueRefresh: true });
      }
      await refreshChromeContextStrip();
    } finally {
      foregroundRefreshInFlight = false;
    }
  }

  function showResurfaceAck(){
    undoAckController.showResurfaceAck();
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
      onUnhideSuccess(id) {
        if (resurfaceShelfState) resurfaceShelfState.removeItem(id);
        void refreshChromeContextStrip();
      },
    });
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ev.defaultPrevented) return;
    if (pinActivityLogState && pinActivityLogState.isOpen()) { closeActivityLogPopover(); return; }
    if (pinPeopleState && pinPeopleState.isOpen()) { pinPeopleState.close(); return; }
    if (hiddenTrayState.isOpen()) {
      closeHiddenTray();
      return;
    }
    if (chromeContextStripState) chromeContextStripState.closeOverflow();
  });

  document.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (chromeContextStripState) chromeContextStripState.handleGlobalPointerDown(target);
    if (peopleFilterState) peopleFilterState.handleOutsidePointer(target);
    if (pinPeopleState) pinPeopleState.handleOutsidePointer(target);
    if (target.closest('.hidden-tray') || target.closest('#hidden-toggle') || target.closest('.context-confirm') || target.closest('.activity-log-popover') || target.closest('.pin-activity') || target.closest('.people-popover') || target.closest('.pin-people-indicator')) return;
    if (target.closest('.sw')) {
      closeHiddenTray();
      return;
    }
    if (target.closest('.filters-tray') || target.closest('.chrome-context-strip')) return;
    if (surface.contains(target)) return;
    closeActivityLogPopover();
    closeHiddenTray();
  });

  surface.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const outsideTrayClick = hiddenTrayState.isOpen() && !target.closest('.hidden-tray') && !target.closest('#hidden-toggle');
    if (outsideTrayClick) closeHiddenTray();
    const outsideActivityLog = pinActivityLogState && pinActivityLogState.isOpen() && !target.closest('.activity-log-popover') && !target.closest('.pin-activity');
    if (outsideActivityLog) closeActivityLogPopover();
    if (pinPeopleState) pinPeopleState.handleOutsidePointer(target);
    if (target.closest('.pin') || target.closest('.toolbar') || target.closest('.hint') || target.closest('.undo-toast') || target.closest('.context-head') || target.closest('.hidden-tray') || target.closest('.context-confirm') || target.closest('.activity-log-popover') || target.closest('.people-popover')) return;
    if (outsideTrayClick) return;
    const rect = getCanvasViewportRect();
    const x = Math.max(6, Math.min(rect.width - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(rect.height - 90, e.clientY - rect.top));
    createPin({id: uid(), title: '', subNote: '', x, y, color: selectedPaletteColor(), personIds: [], slipping: false}, true, false);
    e.preventDefault();
  });

  if (surface.querySelector('.pin')) setActivePin(surface.querySelector('.pin'));
  renderHiddenButton();
  if (lensState.getMode() === 'stale') captureStaleLensSnapshot();
  renderLensButtons();
  syncCanvasViewportRect();
  applyLens();
  void refreshChromeContextStrip();

  window.addEventListener('resize', () => {
    syncCanvasViewportRect();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    lensState.updateBoundaryCue(false);
    undoAckController.refreshAckMode();
    placeHiddenTray();
    if (pinActivityLogState) pinActivityLogState.repositionIfOpen();
    if (chromeContextStripState) chromeContextStripState.closeOverflow();
  });

  window.addEventListener('focus', () => {
    void runForegroundRefreshPass();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void runForegroundRefreshPass();
  });

  window.addEventListener('beforeunload', () => {
    if (resurfaceShelfState) resurfaceShelfState.stop();
  });
})().catch((err) => {
  console.error(err);
});
