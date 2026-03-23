(() => {
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
  const DRAG_THRESHOLD_PX = 5;
  const LENS_MODE_STORAGE_KEY = 'orbit.lens-mode';
  let hiddenCount = window.__HIDDEN_COUNT__ || 0;
  let lens = readLensMode();
  let lensRatio = 0.68;
  const lensExempt = new Set();
  let staleLensSnapshot = new Set();
  const staleLensDetachedPins = new Map();
  let dragHaloActive = false;
  let activePin = null;
  let undoState = null;
  let trayOpen = false;
  let hiddenItemsCache = [];
  const pendingUnhide = new Map();
  let hiddenDragPreview = null;
  const completionTransitions = new Map();
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];
  let canvasViewportRect = null;
  let systemAckState = null;
  let filtersPanel = null;
  let filtersTray = null;
  let swatchRail = null;

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
  async function persistContextTitle(){
    if (!contextNameEl) return;
    const nextTitle = (contextNameEl.textContent || '').trim() || 'Main Orbit';
    contextNameEl.textContent = nextTitle;
    const previousTitle = contextTitlePersisted;
    if (nextTitle === previousTitle) return;
    const saveSeq = ++contextTitleSaveSeq;
    let status = null;
    try {
      const res = await fetch('/api/contexts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: currentContextId, title: nextTitle})
      });
      if (saveSeq !== contextTitleSaveSeq) return;
      status = res.status;
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(detail || `context title save failed (${res.status})`);
      }
      contextTitlePersisted = nextTitle;
    } catch (_err) {
      if (saveSeq !== contextTitleSaveSeq) return;
      logMutationFailure({
        operation: 'context-title-save',
        id: currentContextId,
        contextId: currentContextId,
        endpoint: '/api/contexts',
        status,
        error: mutationErrorSummary(_err),
      });
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

  const hiddenBtn = document.createElement('button');
  hiddenBtn.className = 'hidden-toggle';
  hiddenBtn.id = 'hidden-toggle';
  hiddenBtn.onclick = async () => {
    if (mode !== 'focus') return;
    trayOpen = !trayOpen;
    if (trayOpen) await openHiddenTray();
    else closeHiddenTray();
  };
  filtersControls.appendChild(hiddenBtn);
  if (mode !== 'focus') hiddenBtn.hidden = true;

  const hiddenTray = document.createElement('div');
  hiddenTray.className = 'hidden-tray';
  hiddenTray.hidden = true;
  layoutShell.appendChild(hiddenTray);

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

  function mutationErrorSummary(err){
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch (_jsonErr) {
      return String(err);
    }
  }

  function logMutationFailure({ operation, id, contextId, endpoint, status, error }){
    const payload = {
      operation: operation || '',
      id: id || '',
      contextId: contextId || '',
      endpoint: endpoint || '',
      status: Number.isFinite(status) ? Number(status) : null,
      error: error || '',
    };
    console.error('[mutation-failure]', JSON.stringify(payload));
  }

  function setSystemAckMode(mode){
    if (!systemAckState || !systemAckState.el) return;
    systemAckState.el.dataset.ackMode = mode;
  }

  function placeHiddenTray(){
    const btnRect = hiddenBtn.getBoundingClientRect();
    const stripRect = (systemStrip || layoutShell).getBoundingClientRect();
    const trayW = 240;
    const left = Math.max(8, Math.min(layoutShell.clientWidth - trayW - 8, (btnRect.right - stripRect.left) - trayW));
    const top = Math.max(8, Math.min(layoutShell.clientHeight - 230, (btnRect.bottom - stripRect.top) + 8));
    hiddenTray.style.left = left + 'px';
    hiddenTray.style.top = top + 'px';
  }

  function readLensMode(){
    try {
      const stored = sessionStorage.getItem(LENS_MODE_STORAGE_KEY);
      return stored === 'stale' ? 'stale' : 'all';
    } catch (_err) {
      return 'all';
    }
  }

  function persistLensMode(){
    try {
      if (lens === 'stale') sessionStorage.setItem(LENS_MODE_STORAGE_KEY, 'stale');
      else sessionStorage.removeItem(LENS_MODE_STORAGE_KEY);
    } catch (_err) {}
  }

  function readStaleLensSnapshot(){
    return [...surface.querySelectorAll('.pin[data-stale="true"]')]
      .map((pin) => pin.dataset.id)
      .filter((id) => typeof id === 'string' && id.length > 0);
  }

  function captureStaleLensSnapshot(){
    staleLensSnapshot = new Set(readStaleLensSnapshot());
  }

  function restoreDetachedStalePins(){
    if (!staleLensDetachedPins.size) return;
    for (const [id, pin] of staleLensDetachedPins.entries()) {
      if (pin.isConnected) continue;
      pin.style.display = '';
      surface.appendChild(pin);
      staleLensDetachedPins.delete(id);
    }
  }

  function syncStaleLensDom(){
    if (lens !== 'stale') {
      restoreDetachedStalePins();
      return;
    }
    surface.querySelectorAll('.pin').forEach((pin) => {
      const id = pin.dataset.id;
      const visible = staleLensSnapshot.has(id);
      if (visible) {
        pin.style.display = '';
        return;
      }
      staleLensDetachedPins.set(id, pin);
      pin.remove();
    });
  }

  function setLensMode(nextLens){
    lens = nextLens;
    if (lens === 'stale') {
      captureStaleLensSnapshot();
    } else {
      lensExempt.clear();
      staleLensSnapshot.clear();
      restoreDetachedStalePins();
    }
    persistLensMode();
    renderLensButtons();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    syncCanvasViewportRect();
  }

  const lensWrap = document.createElement('div');
  lensWrap.className = 'lens-toggle';

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'lens-slider-wrap';
  sliderWrap.hidden = true;
  sliderWrap.innerHTML = '<input class="lens-slider" type="range" min="35" max="85" value="68" step="1" aria-label="Lens sensitivity" />';
  const lensSlider = sliderWrap.querySelector('.lens-slider');
  lensSlider.addEventListener('input', () => {
    lensRatio = Number(lensSlider.value) / 100;
    updateBoundaryCue(true);
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
  });
  lensSlider.addEventListener('pointerdown', () => updateBoundaryCue(true));
  lensSlider.addEventListener('pointerup', () => setTimeout(() => updateBoundaryCue(false), 380));

  ['all','center','periphery','stale'].forEach(name => {
    const b = document.createElement('button');
    b.className = 'lens-btn';
    b.dataset.lens = name;
    b.textContent = name[0].toUpperCase() + name.slice(1);
    b.onclick = () => {
      if (name === 'stale') {
        setLensMode(lens === 'stale' ? 'all' : 'stale');
        return;
      }
      setLensMode(name);
    };
    if (name === 'stale') lensWrap.appendChild(sliderWrap);
    lensWrap.appendChild(b);
  });
  filtersControls.appendChild(lensWrap);

  const center = () => ({x: surface.clientWidth/2, y: surface.clientHeight/2});
  const maxR = () => Math.min(surface.clientWidth, surface.clientHeight) * 0.42;
  function proximityFactor(d){ const t = Math.min(1, d / maxR()); return 1 - t; }

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

  function applyDistanceStyle(pin){
    const w = pin.offsetWidth || 180, h = pin.offsetHeight || 72;
    const x = parseFloat(pin.style.left) || 0, y = parseFloat(pin.style.top) || 0;
    const c = center();
    const d = Math.hypot((x+w/2)-c.x, (y+h/2)-c.y);
    const cutoff = maxR() * lensRatio;
    const isCenterBand = d <= cutoff;
    const proximity = proximityFactor(d);

    // Band-based sizing (semantic): Center = A, Periphery = B.
    let cardScale = isCenterBand ? 1.05 : 0.95;
    let titleSize = isCenterBand ? 14.7 : 12.3;
    let bodySize = isCenterBand ? 11.7 : 10.7;
    let titleWt = isCenterBand ? 660 : 560;

    // Periphery lens readability lift: subtle floor for attended outer cards.
    if (mode === 'focus' && lens === 'periphery' && !isCenterBand) {
      cardScale = Math.max(cardScale, 0.98);
      titleSize = Math.max(titleSize, 12.9);
      bodySize = Math.max(bodySize, 11.1);
      titleWt = Math.max(titleWt, 600);
    }

    pin.style.transform = `scale(${cardScale.toFixed(3)})`;
    if (mode === 'focus') {
      pin.dataset.band = isCenterBand ? 'center' : 'periphery';
      const sat = isCenterBand ? (0.96 + proximity * 0.05) : (0.88 + proximity * 0.05);
      const bright = isCenterBand ? (0.98 + proximity * 0.04) : (0.95 + proximity * 0.04);
      const alpha = isCenterBand ? (0.97 + proximity * 0.03) : (0.88 + proximity * 0.06);
      pin.style.setProperty('--pin-sat', sat.toFixed(3));
      pin.style.setProperty('--pin-bright', bright.toFixed(3));
      pin.style.setProperty('--pin-alpha', alpha.toFixed(3));
    } else {
      pin.dataset.band = 'neutral';
      pin.style.removeProperty('--pin-sat');
      pin.style.removeProperty('--pin-bright');
      pin.style.removeProperty('--pin-alpha');
    }
    pin.dataset.inCenter = isCenterBand ? 'true' : 'false';
    const title = pin.querySelector('.pin-title input');
    const note = pin.querySelector('.pin-note textarea');
    title.style.fontSize = `${titleSize.toFixed(2)}px`;
    title.style.fontWeight = String(titleWt);
    note.style.fontSize = `${bodySize.toFixed(2)}px`;
    note.style.fontWeight = '480';
    syncTouchState(pin);
  }

  function refreshSwatches(){
    document.querySelectorAll('.sw').forEach(sw => {
      sw.classList.toggle('active', activePin && activePin.dataset.color === sw.dataset.color);
    });
  }

  function clearHiddenDragPreview(){
    if (!hiddenDragPreview) return;
    hiddenDragPreview.remove();
    hiddenDragPreview = null;
  }

  function showHiddenDragPreview(title, ev){
    clearHiddenDragPreview();
    const preview = document.createElement('div');
    preview.className = 'hidden-drag-preview';
    preview.textContent = title || 'Untitled';
    document.body.appendChild(preview);
    hiddenDragPreview = preview;
    if (ev.dataTransfer) ev.dataTransfer.setDragImage(preview, 16, 16);
  }

  function closeHiddenTray(){
    clearHiddenDragPreview();
    hiddenTray.hidden = true;
    hiddenTray.innerHTML = '';
    trayOpen = false;
    renderHiddenButton();
  }

  function renderHiddenTrayItems(){
    hiddenTray.innerHTML = '';
    if (hiddenItemsCache.length === 0) {
      hiddenTray.innerHTML = '<div class="hidden-tray-empty">No hidden cards</div>';
      return;
    }
    hiddenItemsCache.forEach(it => {
      const t = document.createElement('div');
      t.className = 'hidden-tray-item';
      t.dataset.id = it.id;
      t.textContent = it.title || 'Untitled';
      t.draggable = true;
      t.addEventListener('dragstart', (ev) => {
        showHiddenDragPreview(it.title || 'Untitled', ev);
        ev.dataTransfer.setData('text/orbit-hidden-id', it.id);
      });
      t.addEventListener('dragend', () => {
        clearHiddenDragPreview();
      });
      hiddenTray.appendChild(t);
    });
  }

  function syncHiddenTray(){
    if (!trayOpen) return;
    renderHiddenTrayItems();
  }

  async function openHiddenTray(){
    trayOpen = true;
    hiddenTray.hidden = false;
    placeHiddenTray();
    hiddenTray.innerHTML = '<div class="hidden-tray-empty">Loading…</div>';
    try {
      const res = await fetch('/api/items/hidden', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({contextId: currentContextId})});
      const data = await res.json();
      if (!trayOpen) return;
      hiddenItemsCache = (data.items || []).filter(it => !pendingUnhide.has(it.id));
      renderHiddenTrayItems();
    } catch (e) {
      if (!trayOpen) return;
      hiddenTray.innerHTML = '<div class="hidden-tray-empty">Unable to load hidden cards</div>';
    }
  }

  function renderHiddenButton(){
    const btn = document.getElementById('hidden-toggle');
    if (!btn) return;
    btn.textContent = `Hidden (${hiddenCount})`;
    const shouldHide = hiddenCount <= 0;
    btn.hidden = shouldHide;
    if (shouldHide && trayOpen) {
      closeHiddenTray();
      return;
    }
    if (trayOpen) placeHiddenTray();
    syncCanvasViewportRect();
  }

  function renderLensButtons(){
    document.querySelectorAll('.lens-btn').forEach(b => b.classList.toggle('active', b.dataset.lens === lens));
    const sw = document.querySelector('.lens-slider-wrap');
    if (sw) sw.hidden = (lens === 'all' || lens === 'stale');
    updateBoundaryCue(false);
  }

  function inLens(pin){
    if (lens === 'all') return true;
    const w = pin.offsetWidth || 180, h = pin.offsetHeight || 72;
    const x = parseFloat(pin.style.left) || 0, y = parseFloat(pin.style.top) || 0;
    const c = center();
    const d = Math.hypot((x+w/2)-c.x, (y+h/2)-c.y);
    const cutoff = maxR() * lensRatio;
    if (lens === 'center') return d <= cutoff;
    return d > cutoff;
  }

  function isLensVisible(pin){
    const id = pin.dataset.id;
    if (lens === 'all') return true;
    if (lens === 'stale') return staleLensSnapshot.has(id);
    return lensExempt.has(id) || inLens(pin);
  }

  function applyLens(){
    if (lens === 'stale') {
      syncStaleLensDom();
      return;
    }
    restoreDetachedStalePins();
    surface.querySelectorAll('.pin').forEach(pin => {
      const visible = isLensVisible(pin);
      pin.style.display = visible ? '' : 'none';
    });
  }

  function updateBoundaryCue(forceShow){
    if (!boundaryEl) return;
    const r = maxR() * lensRatio;
    surface.style.setProperty('--center-radius', r + 'px');
    boundaryEl.style.width = (r*2) + 'px';
    boundaryEl.style.height = (r*2) + 'px';
    const shouldShow = forceShow || dragHaloActive || (lens !== 'all' && lens !== 'stale');
    boundaryEl.classList.toggle('show', shouldShow);
  }

  function setDragHalo(active){
    if (dragHaloActive === active) return;
    dragHaloActive = active;
    surface.classList.toggle('focus-emphasis', active);
    updateBoundaryCue(false);
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
    const endpoint = mode === 'focus' ? '/api/items' : '/api/contexts';
    cancelPendingSave(id);
    pending.set(id, setTimeout(async () => {
      const saveSeq = (saveRequestSeq.get(id) || 0) + 1;
      saveRequestSeq.set(id, saveSeq);
      let status = null;
      try {
        const res = await fetch(endpoint, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        if (saveRequestSeq.get(id) !== saveSeq) return;
        status = res.status;
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail || `save failed (${res.status})`);
        }
        const data = await res.json().catch(() => null);
        if (saveRequestSeq.get(id) !== saveSeq) return;
        if (data) applyTouchResponse(pin, data);
        pin.dataset.saved = 'true';
        markPersisted(pin);
      } catch (_err) {
        if (saveRequestSeq.get(id) !== saveSeq) return;
        logMutationFailure({
          operation: mode === 'focus' ? 'save-pin' : 'save-context-card',
          id,
          contextId: currentContextId,
          endpoint,
          status,
          error: mutationErrorSummary(_err),
        });
        pin.dataset.saved = 'false';
        showCanvasWarning(mode === 'focus' ? 'Unable to save card changes. Your edits are kept locally.' : 'Unable to save context changes. Your edits are kept locally.');
      }
    }, 180));
  }

  async function hidePinImmediate(pin){
    if (pin.dataset.hidePending === 'true') return;
    cancelPendingSave(pin.dataset.id);
    pin.dataset.hidePending = 'true';
    let status = null;
    try {
      const r = await fetch('/api/items/hide', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: pin.dataset.id, contextId: currentContextId})
      });
      status = r.status;
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new Error(detail || `hide failed (${r.status})`);
      }
      const d = await r.json().catch(() => null);
      hiddenCount = (d && Number.isFinite(Number(d.hiddenCount))) ? Number(d.hiddenCount) : (hiddenCount + 1);
      renderHiddenButton();
      if (trayOpen) openHiddenTray();
      lensExempt.delete(pin.dataset.id);
      if (activePin === pin) setActivePin(null);
      pin.remove();
      return;
    } catch (_err) {
      logMutationFailure({
        operation: 'hide-pin',
        id: pin.dataset.id,
        contextId: currentContextId,
        endpoint: '/api/items/hide',
        status,
        error: mutationErrorSummary(_err),
      });
      showCanvasWarning('Unable to hide card. Please try again.');
    }
    pin.dataset.hidePending = 'false';
  }

  async function deletePinImmediate(pin){
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = pinPayload(pin);
    const endpoint = mode === 'focus' ? '/api/items/delete' : '/api/contexts/delete';

    if (mode === 'contexts') {
      const ok = await confirmContextDelete(payload.title);
      if (!ok) return;
    }

    // Prevent pending autosave from recreating a just-deleted card/context.
    cancelPendingSave(payload.id);

    let res;
    let status = null;
    try {
      res = await fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id})
      });
      status = res.status;
    } catch (_err) {
      logMutationFailure({
        operation: mode === 'focus' ? 'delete-pin' : 'delete-context',
        id: payload.id,
        contextId: currentContextId,
        endpoint,
        status,
        error: mutationErrorSummary(_err),
      });
      if (mode === 'contexts') {
        showCanvasWarning('Unable to delete context. Please try again.');
      }
      return;
    }
    if (!res.ok && mode === 'contexts') {
      // Compatibility fallback for embedded webview stacks that mishandle POST routes.
      try {
        const retry = await fetch('/api/contexts/delete?id=' + encodeURIComponent(payload.id));
        if (retry.ok) {
          res = retry;
        } else {
          const message = await retry.text();
          logMutationFailure({
            operation: 'delete-context',
            id: payload.id,
            contextId: currentContextId,
            endpoint: '/api/contexts/delete?id=...',
            status: retry.status,
            error: message || `delete context failed (${retry.status})`,
          });
          showCanvasWarning(message || 'Unable to delete context');
          return;
        }
      } catch (_err) {
        logMutationFailure({
          operation: 'delete-context',
          id: payload.id,
          contextId: currentContextId,
          endpoint: '/api/contexts/delete?id=...',
          status: null,
          error: mutationErrorSummary(_err),
        });
        showCanvasWarning('Unable to delete context. Please try again.');
        return;
      }
    } else if (!res.ok) {
      const message = await res.text();
      logMutationFailure({
        operation: mode === 'focus' ? 'delete-pin' : 'delete-context',
        id: payload.id,
        contextId: currentContextId,
        endpoint,
        status,
        error: message || `delete failed (${status})`,
      });
      if (mode === 'contexts') {
        showCanvasWarning(message || 'Unable to delete context');
      }
      return;
    }

    lensExempt.delete(pin.dataset.id);
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
      let res;
      try {
        res = await fetch(mode === 'focus' ? '/api/items' : '/api/contexts', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
      } catch (_err) {
        showCanvasWarning(mode === 'focus' ? 'Unable to restore deleted card. Please try again.' : 'Unable to restore deleted context. Please try again.');
        return false;
      }
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        showCanvasWarning(message || (mode === 'focus' ? 'Unable to restore deleted card.' : 'Unable to restore deleted context.'));
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
      const res = await fetch('/api/items/complete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id, completed: false})
      });
      if (!res.ok) {
        const message = await res.text();
        showCanvasWarning(message || 'Unable to undo completion.');
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
      const res = await fetch('/api/items/touch/undo', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id})
      });
      if (!res.ok) {
        const message = await res.text();
        showCanvasWarning(message || 'Unable to undo touch.');
        return false;
      }
      const data = await res.json();
      if (data && data.undone === false) return false;
      applyTouchResponse(pin, data);
      return true;
    });
  }

  async function touchPinImmediate(pin){
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
    const payload = pinPayload(pin);
    let status = null;
    let res;
    try {
      res = await fetch('/api/items/touch', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id})
      });
      status = res.status;
    } catch (_err) {
      logMutationFailure({
        operation: 'touch-pin',
        id: payload.id,
        contextId: currentContextId,
        endpoint: '/api/items/touch',
        status,
        error: mutationErrorSummary(_err),
      });
      showCanvasWarning('Unable to touch card. Please try again.');
      return;
    }
    if (!res.ok) {
      const message = await res.text();
      logMutationFailure({
        operation: 'touch-pin',
        id: payload.id,
        contextId: currentContextId,
        endpoint: '/api/items/touch',
        status,
        error: message || `touch failed (${status})`,
      });
      showCanvasWarning(message || 'Unable to touch card.');
      return;
    }
    const data = await res.json();
    applyTouchResponse(pin, data);
    if (data.touched) showTouchUndo(pin, payload);
  }

  async function completePinImmediate(pin){
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = pinPayload(pin);
    pin.dataset.transitioning = 'true';
    cancelPendingSave(payload.id);
    let status = null;
    let res;
    try {
      res = await fetch('/api/items/complete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id, completed: true})
      });
      status = res.status;
    } catch (_err) {
      logMutationFailure({
        operation: 'complete-pin',
        id: payload.id,
        contextId: currentContextId,
        endpoint: '/api/items/complete',
        status,
        error: mutationErrorSummary(_err),
      });
      pin.dataset.transitioning = 'false';
      showCanvasWarning('Unable to complete card. Please try again.');
      return;
    }
    if (!res.ok) {
      pin.dataset.transitioning = 'false';
      const message = await res.text();
      logMutationFailure({
        operation: 'complete-pin',
        id: payload.id,
        contextId: currentContextId,
        endpoint: '/api/items/complete',
        status,
        error: message || `complete failed (${status})`,
      });
      showCanvasWarning(message || 'Unable to complete card.');
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
    setTimeout(() => {
      fetch(mode === 'focus' ? '/api/items/delete' : '/api/contexts/delete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: pin.dataset.id, contextId: currentContextId})
      });
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

    pin.addEventListener('pointerdown', (e) => {
      if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
      setActivePin(pin);
      const rect = pin.getBoundingClientRect();
      const surfRect = surface.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      const pointerId = e.pointerId;
      let pointerCaptured = false;
      let ended = false;

      const cleanup = () => {
        if (ended) return;
        ended = true;
        pin.removeEventListener('pointermove', onMove);
        pin.removeEventListener('pointerup', onUp);
        pin.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('lostpointercapture', onUp);
      };

      const onMove = (ev) => {
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (!dragging && dist < DRAG_THRESHOLD_PX) return;
        if (!dragging) {
          dragging = true;
          pin.classList.add('dragging');
          try {
            pin.setPointerCapture(pointerId);
            pointerCaptured = true;
          } catch (_err) {}
          if (mode === 'focus') setDragHalo(true);
          if (document.activeElement && pin.contains(document.activeElement)) document.activeElement.blur();
        }
        const w = pin.offsetWidth || rect.width;
        const h = pin.offsetHeight || rect.height;
        const x = ev.clientX - surfRect.left - offsetX;
        const y = ev.clientY - surfRect.top - offsetY;
        pin.style.left = Math.max(6, Math.min(surface.clientWidth - w - 6, x)) + 'px';
        pin.style.top = Math.max(6, Math.min(surface.clientHeight - h - 6, y)) + 'px';
        applyDistanceStyle(pin);
        pin.style.display = ''; // active card exempt while manipulating
      };

      const onUp = (ev) => {
        cleanup();
        if (dragging) {
          pin.classList.remove('dragging');
          if (pointerCaptured && pin.hasPointerCapture(ev.pointerId)) {
            try {
              pin.releasePointerCapture(ev.pointerId);
            } catch (_err) {}
          }
          if (mode === 'focus') setDragHalo(false);
          applyDistanceStyle(pin);
          savePin(pin); // no snap/reassign/normalize
        }
      };

      pin.addEventListener('pointermove', onMove);
      pin.addEventListener('pointerup', onUp);
      pin.addEventListener('pointercancel', onUp);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('lostpointercapture', onUp);
    });

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
    if (markSaved) lensExempt.delete(item.id);
    else lensExempt.add(item.id);
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
    pin.style.display = (lens === 'stale' ? isLensVisible(pin) : (!markSaved || isLensVisible(pin))) ? '' : 'none';
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


  surface.addEventListener('dragover', (e) => {
    if (!trayOpen) return;
    if (e.dataTransfer && e.dataTransfer.types.includes('text/orbit-hidden-id')) {
      e.preventDefault();
      if (mode === 'focus') setDragHalo(true);
    }
  });

  surface.addEventListener('dragleave', (e) => {
    if (!trayOpen || mode !== 'focus') return;
    const next = e.relatedTarget;
    if (!next || !surface.contains(next)) setDragHalo(false);
  });

  surface.addEventListener('drop', async (e) => {
    if (!trayOpen || mode !== 'focus') return;
    const id = e.dataTransfer && e.dataTransfer.getData('text/orbit-hidden-id');
    if (!id) return;
    e.preventDefault();
    clearHiddenDragPreview();
    setDragHalo(false);
    const rect = getCanvasViewportRect();
    const x = Math.max(6, Math.min(rect.width - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(rect.height - 90, e.clientY - rect.top));
    if (pendingUnhide.has(id)) return;
    const itemIndex = hiddenItemsCache.findIndex(i => i.id === id);
    if (itemIndex < 0) return;
    const item = hiddenItemsCache[itemIndex];
    pendingUnhide.set(id, {item, index: itemIndex, x, y});
    hiddenItemsCache = hiddenItemsCache.filter(i => i.id !== id);
    hiddenCount = Math.max(0, hiddenCount - 1);
    renderHiddenButton();
    syncHiddenTray();
    const persist = async () => {
      let status = null;
      try {
        const res = await fetch('/api/items/unhide-at', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, contextId: currentContextId, x, y})});
        status = res.status;
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(detail || `unhide failed (${res.status})`);
        }
        const data = await res.json().catch(() => null);
        const pending = pendingUnhide.get(id);
        if (!pending) return;
        pendingUnhide.delete(id);
        const restoredItem = data && data.item ? {...pending.item, ...data.item, x, y} : {...pending.item, x, y};
        if (!surface.querySelector(`.pin[data-id="${id}"]`)) createPin(restoredItem, false, true);
        showResurfaceAck();
      } catch (_err) {
        logMutationFailure({
          operation: 'unhide-at',
          id,
          contextId: currentContextId,
          endpoint: '/api/items/unhide-at',
          status,
          error: mutationErrorSummary(_err),
        });
        const pending = pendingUnhide.get(id);
        if (!pending) return;
        pendingUnhide.delete(id);
        if (!hiddenItemsCache.find(i => i.id === id)) {
          if (Number.isInteger(pending.index) && pending.index >= 0 && pending.index <= hiddenItemsCache.length) {
            hiddenItemsCache.splice(pending.index, 0, pending.item);
          } else {
            hiddenItemsCache.push(pending.item);
          }
          hiddenCount += 1;
          renderHiddenButton();
          syncHiddenTray();
        }
        showCanvasWarning('Couldn\u2019t unhide item. Please try again.');
      }
    };
    persist();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ev.defaultPrevented) return;
    if (!trayOpen) return;
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
    const outsideTrayClick = trayOpen && !target.closest('.hidden-tray') && !target.closest('#hidden-toggle');
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
  if (lens === 'stale') captureStaleLensSnapshot();
  renderLensButtons();
  syncCanvasViewportRect();
  applyLens();

  window.addEventListener('resize', () => {
    syncCanvasViewportRect();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    updateBoundaryCue(false);
    if (systemAckState) refreshSystemAckMode(systemAckState.el);
    if (trayOpen) placeHiddenTray();
  });
})();
