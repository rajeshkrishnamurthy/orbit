void (async () => {
  const [
    {createLensStateController},
    {createHiddenTrayController},
    {createDragDropController},
  ] = await Promise.all([
    import('/static/lens_state.js'),
    import('/static/hidden_tray_state.js'),
    import('/static/drag_drop_state.js'),
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
  const UNDO_WINDOW_MS = 6000;
  let activePin = null;
  let undoState = null;
  const completionTransitions = new Map();
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];
  let canvasViewportRect = null;
  let systemAckState = null;
  let filtersPanel = null;
  let filtersTray = null;
  let swatchRail = null;
  let lensState = null;
  let hiddenTrayState = null;
  let dragDropState = null;

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
  let contextTitlePersisted = contextNameEl ? ((contextNameEl.textContent || '').trim() || 'Main Orbit') : 'Main Orbit';
  let contextTitleSaveSeq = 0;
  let mutationTransportPromise = null;
  function getMutationTransport(){
    if (!mutationTransportPromise) {
      mutationTransportPromise = import('/static/mutation_transport.js')
        .then((mod) => mod.createMutationTransport({fetchImpl: window.fetch.bind(window)}));
    }
    return mutationTransportPromise;
  }
  async function persistContextTitle(){
    if (!contextNameEl) return;
    const nextTitle = (contextNameEl.textContent || '').trim() || 'Main Orbit';
    contextNameEl.textContent = nextTitle;
    const previousTitle = contextTitlePersisted;
    if (nextTitle === previousTitle) return;
    const saveSeq = ++contextTitleSaveSeq;
    try {
      const transport = await getMutationTransport();
      const result = await transport.saveContextTitle({contextId: currentContextId, title: nextTitle});
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

  function ackModeForWidth(width){
    if (width < 900) return 'hidden';
    if (width < 1180) return 'compact';
    return 'full';
  }

  function clearSystemAck(){
    if (!systemAckState) return;
    clearTimeout(systemAckState.timer);
    systemAckState.el.remove();
    systemAckState = null;
    syncCanvasViewportRect();
  }

  function refreshSystemAckMode(el){
    if (!el) return;
    el.dataset.ackMode = ackModeForWidth(stripWidth());
  }

  function mountSystemAck(el, durationMs){
    if (!systemAckArea) return;
    clearSystemAck();
    systemAckArea.appendChild(el);
    refreshSystemAckMode(el);
    syncCanvasViewportRect();
    systemAckState = {
      el,
      timer: durationMs > 0 ? setTimeout(() => {
        clearSystemAck();
      }, durationMs) : null,
    };
  }

  function buildSystemAck({kind, className, label, token, buttonLabel, onButton, durationMs = 0}){
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

  function showCanvasWarning(message){
    buildSystemAck({
      kind: 'warning',
      className: 'canvas-warning',
      label: message || 'Unable to complete action.',
      token: '!',
      durationMs: 2800,
    });
  }

  function setSystemAckMode(mode){
    if (!systemAckState || !systemAckState.el) return;
    systemAckState.el.dataset.ackMode = mode;
  }

  lensState = createLensStateController({
    surface,
    boundaryEl,
    filtersControls,
    mode,
    syncCanvasViewportRect,
    syncTouchState,
  });

  hiddenTrayState = createHiddenTrayController({
    layoutShell,
    systemStrip,
    filtersControls,
    surface,
    mode,
    currentContextId,
    initialHiddenCount: window.__HIDDEN_COUNT__ || 0,
    getMutationTransport,
    getCanvasViewportRect,
    setDragHalo,
    createPin,
    showCanvasWarning,
    showResurfaceAck,
    syncCanvasViewportRect,
  });

  dragDropState = createDragDropController({
    surface,
    mode,
    dragThresholdPx: 5,
    setDragHalo,
    applyDistanceStyle,
    savePin,
  });

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

  function fitNoteHeight(noteEl){
    if (!noteEl) return;
    noteEl.style.height = 'auto';
    const h = Math.max(18, Math.min(noteEl.scrollHeight, 36));
    noteEl.style.height = h + 'px';
  }

  function resolveCssColorToRgb(cssColor){
    const probe = document.createElement('span');
    probe.style.color = cssColor;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? {r:+m[1],g:+m[2],b:+m[3]} : {r:80,g:100,b:150};
  }

  function rgbToHsl(rgb){
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      switch (max) {
        case r:
          h = (g - b) / delta + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / delta + 2;
          break;
        default:
          h = (r - g) / delta + 4;
          break;
      }
      h /= 6;
    }

    return {h, s, l};
  }

  function hslToRgb(hsl){
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };

    let r = hsl.l;
    let g = hsl.l;
    let b = hsl.l;

    if (hsl.s !== 0) {
      const q = hsl.l < 0.5 ? hsl.l * (1 + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s;
      const p = 2 * hsl.l - q;
      r = hue2rgb(p, q, hsl.h + 1 / 3);
      g = hue2rgb(p, q, hsl.h);
      b = hue2rgb(p, q, hsl.h - 1 / 3);
    }

    return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
  }

  function clamp01(value){
    return Math.max(0, Math.min(1, value));
  }

  function deriveTouchColors(rgb, luminance){
    const hsl = rgbToHsl(rgb);
    const pivot = 0.62;
    const isBright = luminance >= pivot;
    const direction = isBright ? -1 : 1;
    const contrast = isBright
      ? clamp01((luminance - pivot) / 0.28)
      : clamp01((pivot - luminance) / 0.28);
    const ringSpread = isBright ? 8 + Math.round(contrast * 2) : 6;
    const ringAlpha = isBright ? 0.18 + contrast * 0.05 : 0.11 + contrast * 0.02;
    const blurAlpha = isBright ? 0.12 + contrast * 0.04 : 0.08;
    const accent = hslToRgb({
      h: hsl.h,
      s: clamp01(hsl.s * (isBright ? 1.12 : 1.08) + 0.03),
      l: clamp01(hsl.l + direction * (isBright ? 0.10 + contrast * 0.03 : 0.12 + contrast * 0.03))
    });
    const halo = hslToRgb({
      h: hsl.h,
      s: clamp01(hsl.s * (isBright ? 1.18 : 1.04) + 0.04),
      l: clamp01(hsl.l + direction * (isBright ? 0.22 + contrast * 0.08 : 0.18 + contrast * 0.06))
    });
    return {accent, halo, ringSpread, ringAlpha, blurAlpha};
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

  function localDayStringJS(date = new Date()){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function localDayOffsetJS(days){
    const date = new Date();
    date.setDate(date.getDate() - days);
    return localDayStringJS(date);
  }

  function withinLocalDaysJS(day, days){
    if (!day) return false;
    return day >= localDayOffsetJS(days);
  }

  function syncTouchState(pin){
    if (mode !== 'focus') return;
    const touchedToday = pin.dataset.touchedToday === 'true';
    const touch = pin.querySelector('.pin-touch');
    if (touch) {
      touch.dataset.touchedToday = touchedToday ? 'true' : 'false';
      touch.textContent = touchedToday ? '●' : '◌';
      touch.setAttribute('aria-label', touchedToday ? 'Touched today' : 'Touch card');
      touch.title = touchedToday ? 'Touched today' : 'Touch card';
      touch.setAttribute('aria-pressed', touchedToday ? 'true' : 'false');
    }
  }

  function setPinColor(pin, color){
    pin.style.background = color;
    pin.dataset.color = color;
    const rgb = resolveCssColorToRgb(color);
    const luminance = (0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b)/255;
    const touch = deriveTouchColors(rgb, luminance);
    pin.style.setProperty('--pin-touch-accent-rgb', `${touch.accent.r}, ${touch.accent.g}, ${touch.accent.b}`);
    pin.style.setProperty('--pin-touch-halo-rgb', `${touch.halo.r}, ${touch.halo.g}, ${touch.halo.b}`);
    pin.style.setProperty('--pin-touch-ring-spread', `${touch.ringSpread}px`);
    pin.style.setProperty('--pin-touch-ring-alpha', touch.ringAlpha.toFixed(3));
    pin.style.setProperty('--pin-touch-blur-alpha', touch.blurAlpha.toFixed(3));
    const titleEl = pin.querySelector('.pin-title input');
    const noteEl = pin.querySelector('.pin-note textarea');
    const delEl = pin.querySelector('.pin-delete');
    const hideEl = pin.querySelector('.pin-hide');
    const enterEl = pin.querySelector('.pin-enter');
    const touchEl = pin.querySelector('.pin-touch');
    if (luminance > 0.62){
      titleEl.style.color = '#0f1b2d';
      noteEl.style.color = '#1f2d45';
    } else {
      titleEl.style.color = '#fff';
      noteEl.style.color = '#eaf0ff';
    }
    if (delEl) delEl.style.color = '#f5f8ff';
    if (hideEl) hideEl.style.color = '#f5f8ff';
    if (enterEl) enterEl.style.color = '#f5f8ff';
    if (touchEl) touchEl.style.color = '#f5f8ff';
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

  const pending = new Map();
  const saveRequestSeq = new Map();

  function markPersisted(pin){
    pin.dataset.persistedTitle = pin.querySelector('.pin-title input').value;
    pin.dataset.persistedSubNote = pin.querySelector('.pin-note textarea').value;
  }
  function cancelPendingSave(id){
    clearTimeout(pending.get(id));
    pending.delete(id);
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
    if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
    const id = pin.dataset.id;
    const payload = pinPayload(pin);
    cancelPendingSave(id);
    pending.set(id, setTimeout(async () => {
      const saveSeq = (saveRequestSeq.get(id) || 0) + 1;
      saveRequestSeq.set(id, saveSeq);
      try {
        const transport = await getMutationTransport();
        const result = await transport.saveModeEntity({mode, payload});
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

  function clearUndo(){
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

  function showUndoToast(message, kind, id, onUndo, durationMs = UNDO_WINDOW_MS){
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
      }, durationMs)
    };
  }
  function showDeleteUndo(payload){
    showUndoToast('Deleted', 'delete', payload.id, async () => {
      let result;
      try {
        const transport = await getMutationTransport();
        result = await transport.restoreDeleted({mode, payload});
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
  function showCompleteUndo(pin, payload, token){
    showUndoToast('Completed', 'complete', payload.id, async () => {
      const current = completionTransitions.get(payload.id);
      if (!current || current.token !== token) return false;
      const transport = await getMutationTransport();
      const result = await transport.setItemCompleted({id: payload.id, completed: false});
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

  function showResurfaceAck(){
    buildSystemAck({
      kind: 'resurface',
      className: 'resurface-ack',
      label: 'Resurfaced',
      token: '↺',
      durationMs: 2400,
    });
  }

  function applyTouchResponse(pin, data){
    if (!pin || !data) return;
    if (typeof data.touchedToday === 'boolean') pin.dataset.touchedToday = data.touchedToday ? 'true' : 'false';
    if (Number.isFinite(Number(data.touchCount7d))) pin.dataset.touchCount7d = String(Number(data.touchCount7d));
    if (typeof data.lastTouchedDay === 'string') pin.dataset.lastTouchedDay = data.lastTouchedDay;
    if (typeof data.active === 'boolean') pin.dataset.active = data.active ? 'true' : 'false';
    if (typeof data.stale === 'boolean') pin.dataset.stale = data.stale ? 'true' : 'false';
    syncTouchState(pin);
  }

  function showTouchUndo(pin, payload){
    showUndoToast('Touched', 'touch', payload.id, async () => {
      const transport = await getMutationTransport();
      const result = await transport.undoTouchItem({id: payload.id});
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
        if (activePin === pin) setActivePin(null);
        pin.remove();
        latest.removed = true;
      }, 1220);
    }, 120);
    completionTransitions.set(payload.id, {token, exitTimer, removed: false});
    showCompleteUndo(pin, payload, token);
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

  function bindPin(pin){
    const drawerHost = pin.querySelector('.pin-action-host');
    const rightEdge = pin.querySelector('.pin-edge--right');
    const del = pin.querySelector('.pin-delete');
    const hide = pin.querySelector('.pin-hide');
    const slip = pin.querySelector('.pin-slip');
    const complete = pin.querySelector('.pin-complete');
    const touch = pin.querySelector('.pin-touch');
    if (rightEdge) {
      rightEdge.addEventListener('pointerdown', ev => ev.stopPropagation());
      rightEdge.addEventListener('click', ev => ev.stopPropagation());
    }
    if (drawerHost) {
      drawerHost.addEventListener('pointerdown', ev => ev.stopPropagation());
      drawerHost.addEventListener('click', ev => {
        if (!ev.target.closest('button')) ev.stopPropagation();
      });
    }
    if (slip) {
      slip.addEventListener('pointerdown', ev => ev.stopPropagation());
      slip.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
        const on = pin.dataset.slipping !== 'true';
        setSlipping(pin, on);
        savePin(pin);
      });
    }
    if (hide) {
      hide.addEventListener('pointerdown', ev => ev.stopPropagation());
      hide.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
        hidePinImmediate(pin);
      });
    }
    if (complete) {
      complete.addEventListener('pointerdown', ev => ev.stopPropagation());
      complete.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        completePinImmediate(pin);
      });
    }
    if (touch) {
      touch.addEventListener('pointerdown', ev => ev.stopPropagation());
      touch.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        touchPinImmediate(pin);
      });
    }
    const enter = pin.querySelector('.pin-enter');
    if (enter) {
      enter.addEventListener('pointerdown', ev => ev.stopPropagation());
      enter.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        if (mode === 'contexts') location.href = '/?ctx=' + encodeURIComponent(pin.dataset.id);
      });
    }
    if (del) {
      del.addEventListener('pointerdown', ev => ev.stopPropagation());
      del.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pin.dataset.saved !== 'true') {
          pin.classList.add('discarding');
          setTimeout(() => {
            if (activePin === pin) setActivePin(null);
            pin.remove();
          }, 120);
          return;
        }
        deletePinImmediate(pin);
      });
    }

    dragDropState.bindPinDrag(pin, setActivePin);

    pin.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('input', () => {
        if (input.tagName === 'TEXTAREA') fitNoteHeight(input);
        applyDistanceStyle(pin);
        savePin(pin);
      });
      input.addEventListener('focus', () => setActivePin(pin));
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
            savePin(pin);
            input.blur();
            return;
          }
        }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          if (pin.dataset.saved !== 'true') {
            pin.classList.add('discarding');
            setTimeout(() => {
              if (activePin === pin) setActivePin(null);
              pin.remove();
            }, 120);
            return;
          }
          const titleInput = pin.querySelector('.pin-title input');
          const noteInput = pin.querySelector('.pin-note textarea');
          titleInput.value = pin.dataset.persistedTitle || '';
          noteInput.value = pin.dataset.persistedSubNote || '';
          fitNoteHeight(noteInput);
          applyDistanceStyle(pin);
          input.blur();
        }
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          const focusedInside = pin.contains(document.activeElement);
          if (!focusedInside) discardIfEmpty(pin);
        }, 0);
      });
    });
  }

  function createPin(item, focusTitle = false, markSaved = false){
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
    const enterBtn = mode === 'contexts' ? '<button class=\"pin-enter\" aria-label=\"Enter context\" title=\"Enter\">→</button>' : '';
    const slipBtn = mode === 'focus' ? '<button class=\"pin-slip\" aria-label=\"Slipping\" title=\"Slipping\">!</button>' : '';
    const actionDrawer = mode === 'focus' ? '<div class=\"pin-action-host\"><span class=\"pin-action-affordance\" aria-hidden=\"true\">⋯</span><span class=\"pin-drawer-dim\" aria-hidden=\"true\"></span><div class=\"pin-action-drawer\" role=\"group\" aria-label=\"Card actions\"><button class=\"pin-hide\" aria-label=\"Minimize card\" title=\"Minimize\">–</button><button class=\"pin-delete\" aria-label=\"Cancel card\" title=\"Cancel\">×</button><button class=\"pin-complete\" aria-label=\"Complete card\" title=\"Complete\">✓</button></div></div><span class=\"pin-complete-smile\" aria-hidden=\"true\"></span><button class=\"pin-touch\" aria-pressed=\"false\" aria-label=\"Touch card\" title=\"Touch card\">◌</button>' : '';
    const deleteBtn = mode === 'contexts' ? '<button class=\"pin-delete\" aria-label=\"Delete card\" title=\"Delete\">×</button>' : '';
    pin.innerHTML = `${edgeTargets}${actionDrawer}${enterBtn}${slipBtn}${deleteBtn}<label class=\"pin-title\"><input value=\"${(item.title||'').replace(/"/g,'&quot;')}\" /></label><label class=\"pin-note\"><textarea rows=\"2\">${(item.subNote||'').replace(/</g,'&lt;')}</textarea></label>`;
    pin.dataset.persistedTitle = item.title || '';
    pin.dataset.persistedSubNote = item.subNote || ''; 
    surface.appendChild(pin);
    setPinColor(pin, item.color || 'var(--c1)');
    setSlipping(pin, !!item.slipping);
    applyDistanceStyle(pin);
    bindPin(pin);
    pin.style.display = lensState.initialDisplayValue(pin, markSaved);
    const ta = pin.querySelector('.pin-note textarea'); fitNoteHeight(ta);
    setActivePin(pin);
    if (focusTitle) {
      const titleInput = pin.querySelector('.pin-title input');
      titleInput.focus();
      titleInput.select();
    }
    return pin;
  }

  items.forEach((item) => createPin(item, false, true));


  dragDropState.bindSurfaceInteractions(hiddenTrayState);

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
    if (systemAckState) refreshSystemAckMode(systemAckState.el);
    placeHiddenTray();
  });
})().catch((err) => {
  console.error(err);
});
