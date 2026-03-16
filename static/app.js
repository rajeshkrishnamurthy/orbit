(() => {
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const boundaryEl = document.createElement('div');
  boundaryEl.className = 'lens-boundary';
  surface.appendChild(boundaryEl);
  const items = window.__ITEMS__ || [];
  const mode = window.__MODE__ || 'focus';
  const currentContextId = window.__CURRENT_CONTEXT_ID__ || 'main-orbit';
  const UNDO_WINDOW_MS = 3000;
  let hiddenCount = window.__HIDDEN_COUNT__ || 0;
  let lens = 'all';
  let lensRatio = 0.68;
  const lensExempt = new Set();
  let dragHaloActive = false;
  let activePin = null;
  let undoState = null;
  let trayOpen = false;
  let hiddenItemsCache = [];
  const completionTransitions = new Map();
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];

  toolbar.innerHTML = '<span style="font-size:12px;color:#c4cdef">Card color</span>';
  const contextNameEl = document.getElementById('context-name');
  const openContextsEl = document.getElementById('open-contexts');
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
    contextNameEl.addEventListener('blur', () => {
      fetch('/api/contexts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id: currentContextId, title: contextNameEl.textContent || 'Main Orbit'})});
    });
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
    toolbar.appendChild(b);
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
  toolbar.appendChild(hiddenBtn);
  if (mode !== 'focus') hiddenBtn.hidden = true;

  const hiddenTray = document.createElement('div');
  hiddenTray.className = 'hidden-tray';
  hiddenTray.hidden = true;
  surface.appendChild(hiddenTray);

  const contextConfirm = document.createElement('div');
  contextConfirm.className = 'context-confirm';
  contextConfirm.hidden = true;
  contextConfirm.innerHTML = '<div class="context-confirm__panel"><div class="context-confirm__title">Delete context?</div><div class="context-confirm__body" id="context-confirm-body">This will also delete all items inside this context.</div><div class="context-confirm__actions"><button type="button" class="context-confirm__btn context-confirm__btn--ghost" id="context-confirm-cancel">Cancel</button><button type="button" class="context-confirm__btn context-confirm__btn--danger" id="context-confirm-delete">Delete</button></div></div>';
  surface.appendChild(contextConfirm);
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

  function showCanvasWarning(message){
    const el = document.createElement('div');
    el.className = 'canvas-warning';
    el.textContent = message || 'Unable to complete action.';
    surface.appendChild(el);
    setTimeout(() => { el.remove(); }, 2800);
  }

  function placeHiddenTray(){
    const btnRect = hiddenBtn.getBoundingClientRect();
    const surfRect = surface.getBoundingClientRect();
    const trayW = 240;
    const left = Math.max(8, Math.min(surface.clientWidth - trayW - 8, (btnRect.right - surfRect.left) - trayW));
    const top = Math.max(8, Math.min(surface.clientHeight - 230, (btnRect.bottom - surfRect.top) + 8));
    hiddenTray.style.left = left + 'px';
    hiddenTray.style.top = top + 'px';
  }

  const lensWrap = document.createElement('div');
  lensWrap.className = 'lens-toggle';
  ['all','center','periphery'].forEach(name => {
    const b = document.createElement('button');
    b.className = 'lens-btn';
    b.dataset.lens = name;
    b.textContent = name[0].toUpperCase() + name.slice(1);
    b.onclick = () => {
      lens = name;
      lensExempt.clear(); // explicit lens re-application
      renderLensButtons();
      surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
      applyLens();
    };
    lensWrap.appendChild(b);
  });
  toolbar.appendChild(lensWrap);

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
  toolbar.appendChild(sliderWrap);

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
    pin.style.background = color;
    pin.dataset.color = color;
    const rgb = resolveCssColorToRgb(color);
    const luminance = (0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b)/255;
    const titleEl = pin.querySelector('.pin-title input');
    const noteEl = pin.querySelector('.pin-note textarea');
    const delEl = pin.querySelector('.pin-delete');
    const hideEl = pin.querySelector('.pin-hide');
    const enterEl = pin.querySelector('.pin-enter');
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
      const sat = isCenterBand ? (0.96 + proximity * 0.05) : (0.84 + proximity * 0.04);
      const bright = isCenterBand ? (0.98 + proximity * 0.04) : (0.93 + proximity * 0.03);
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
    const title = pin.querySelector('.pin-title input');
    const note = pin.querySelector('.pin-note textarea');
    title.style.fontSize = `${titleSize.toFixed(2)}px`;
    title.style.fontWeight = String(titleWt);
    note.style.fontSize = `${bodySize.toFixed(2)}px`;
    note.style.fontWeight = '480';
  }

  function refreshSwatches(){
    document.querySelectorAll('.sw').forEach(sw => {
      sw.classList.toggle('active', activePin && activePin.dataset.color === sw.dataset.color);
    });
  }

  function closeHiddenTray(){
    hiddenTray.hidden = true;
    hiddenTray.innerHTML = '';
    trayOpen = false;
  }

  async function openHiddenTray(){
    hiddenTray.hidden = false;
    placeHiddenTray();
    hiddenTray.innerHTML = '<div class="hidden-tray-empty">Loading…</div>';
    try {
      const res = await fetch('/api/items/hidden', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({contextId: currentContextId})});
      const data = await res.json();
      hiddenItemsCache = data.items || [];
      hiddenTray.innerHTML = '';
      if (hiddenItemsCache.length === 0) {
        hiddenTray.innerHTML = '<div class="hidden-tray-empty">No hidden cards</div>';
      }
      hiddenItemsCache.forEach(it => {
        const t = document.createElement('div');
        t.className = 'hidden-tray-item';
        t.textContent = it.title || 'Untitled';
        t.draggable = true;
        t.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/orbit-hidden-id', it.id);
        });
        hiddenTray.appendChild(t);
      });
      trayOpen = true;
    } catch (e) {
      hiddenTray.innerHTML = '<div class="hidden-tray-empty">Unable to load hidden cards</div>';
      trayOpen = true;
    }
  }

  function renderHiddenButton(){
    const btn = document.getElementById('hidden-toggle');
    if (!btn) return;
    btn.textContent = `Hidden (${hiddenCount})`;
    btn.hidden = hiddenCount <= 0;
  }

  function renderLensButtons(){
    document.querySelectorAll('.lens-btn').forEach(b => b.classList.toggle('active', b.dataset.lens === lens));
    const sw = document.querySelector('.lens-slider-wrap');
    if (sw) sw.hidden = (lens === 'all');
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

  function applyLens(){
    surface.querySelectorAll('.pin').forEach(pin => {
      const id = pin.dataset.id;
      const visible = lens === 'all' || lensExempt.has(id) || inLens(pin);
      pin.style.display = visible ? '' : 'none';
    });
  }

  function updateBoundaryCue(forceShow){
    if (!boundaryEl) return;
    const r = maxR() * lensRatio;
    surface.style.setProperty('--center-radius', r + 'px');
    boundaryEl.style.width = (r*2) + 'px';
    boundaryEl.style.height = (r*2) + 'px';
    const shouldShow = forceShow || dragHaloActive || lens !== 'all';
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
    pending.set(id, setTimeout(() => {
      fetch(mode === 'focus' ? '/api/items' : '/api/contexts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      }).then(() => {
        pin.dataset.saved = 'true';
        markPersisted(pin);
      });
    }, 180));
  }

  function hidePinImmediate(pin){
    cancelPendingSave(pin.dataset.id);
    fetch('/api/items/hide', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id: pin.dataset.id, contextId: currentContextId})
    }).then(async (r) => {
      const d = await r.json();
      hiddenCount = d.hiddenCount || (hiddenCount + 1);
      renderHiddenButton();
      if (trayOpen) openHiddenTray();
    });
    lensExempt.delete(pin.dataset.id);
    if (activePin === pin) setActivePin(null);
    pin.remove();
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

    let res;
    try {
      res = await fetch(mode === 'focus' ? '/api/items/delete' : '/api/contexts/delete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id})
      });
    } catch (_err) {
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
          showCanvasWarning(message || 'Unable to delete context');
          return;
        }
      } catch (_err) {
        showCanvasWarning('Unable to delete context. Please try again.');
        return;
      }
    } else if (!res.ok) {
      const message = await res.text();
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
    undoState = null;
  }

  function showUndoToast(message, kind, id, onUndo){
    clearUndo();
    const el = document.createElement('div');
    el.className = 'undo-toast';
    el.innerHTML = `<span>${message}</span><button class="undo-btn">Undo</button>`;
    const btn = el.querySelector('.undo-btn');
    btn.addEventListener('click', async () => {
      const ok = await onUndo();
      if (ok !== false) clearUndo();
    });
    surface.appendChild(el);
    undoState = {
      id,
      kind,
      el,
      timer: setTimeout(() => {
        clearUndo();
      }, UNDO_WINDOW_MS)
    };
  }
  function showDeleteUndo(payload){
    showUndoToast('Deleted', 'delete', payload.id, () => {
      createPin(payload, false, true);
      fetch(mode === 'focus' ? '/api/items' : '/api/contexts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
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
      restoredPin.classList.remove('pin--complete-pop', 'pin--complete-pulse', 'pin--complete-exit');
      setPinState(restoredPin, 'active');
      restoredPin.dataset.transitioning = 'false';
      applyDistanceStyle(restoredPin);
      restoredPin.style.display = inLens(restoredPin) ? '' : 'none';
      setActivePin(restoredPin);
      return true;
    });
  }
  async function completePinImmediate(pin){
    if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
    if (pin.dataset.transitioning === 'true' || pin.dataset.state === 'completed') return;
    const payload = pinPayload(pin);
    pin.dataset.transitioning = 'true';
    cancelPendingSave(payload.id);
    let res;
    try {
      res = await fetch('/api/items/complete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: payload.id, completed: true})
      });
    } catch (_err) {
      pin.dataset.transitioning = 'false';
      showCanvasWarning('Unable to complete card. Please try again.');
      return;
    }
    if (!res.ok) {
      pin.dataset.transitioning = 'false';
      const message = await res.text();
      showCanvasWarning(message || 'Unable to complete card.');
      return;
    }
    setPinState(pin, 'completed');
    pin.dataset.transitioning = 'false';
    pin.classList.add('pin--complete-pop', 'pin--complete-pulse');
    if (document.activeElement && pin.contains(document.activeElement)) document.activeElement.blur();
    const token = Symbol(payload.id);
    const exitTimer = setTimeout(() => {
      const current = completionTransitions.get(payload.id);
      if (!current || current.token !== token) return;
      pin.classList.add('pin--complete-jiggle');
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
    const del = pin.querySelector('.pin-delete');
    const hide = pin.querySelector('.pin-hide');
    const slip = pin.querySelector('.pin-slip');
    const complete = pin.querySelector('.pin-complete');
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

      const onMove = (ev) => {
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (!dragging && dist < 3) return;
        if (!dragging) {
          dragging = true;
          pin.classList.add('dragging');
          pin.setPointerCapture(e.pointerId);
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
        if (dragging) {
          pin.classList.remove('dragging');
          pin.releasePointerCapture(ev.pointerId);
          if (mode === 'focus') setDragHalo(false);
          applyDistanceStyle(pin);
          savePin(pin); // no snap/reassign/normalize
        }
        pin.removeEventListener('pointermove', onMove);
        pin.removeEventListener('pointerup', onUp);
        pin.removeEventListener('pointercancel', onUp);
      };

      pin.addEventListener('pointermove', onMove);
      pin.addEventListener('pointerup', onUp);
      pin.addEventListener('pointercancel', onUp);
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
    pin.dataset.state = item.completed ? 'completed' : 'active';
    pin.dataset.transitioning = 'false';
    if (markSaved) lensExempt.delete(item.id);
    else lensExempt.add(item.id);
    pin.dataset.saved = markSaved ? 'true' : 'false';
    pin.style.left = `${item.x}px`;
    pin.style.top = `${item.y}px`;
    const enterBtn = mode === 'contexts' ? '<button class=\"pin-enter\" aria-label=\"Enter context\" title=\"Enter\">→</button>' : '';
    const hideBtn = mode === 'focus' ? '<button class=\"pin-hide\" aria-label=\"Hide card\" title=\"Hide\">–</button>' : '';
    const slipBtn = mode === 'focus' ? '<button class=\"pin-slip\" aria-label=\"Slipping\" title=\"Slipping\">!</button>' : '';
    const completeBtn = mode === 'focus' ? '<button class=\"pin-complete\" aria-label=\"Complete card\" title=\"Complete\">✓</button>' : '';
    pin.innerHTML = `${hideBtn}${enterBtn}${slipBtn}${completeBtn}<button class=\"pin-delete\" aria-label=\"Delete card\" title=\"Delete\">×</button><label class=\"pin-title\"><input value=\"${(item.title||'').replace(/"/g,'&quot;')}\" /></label><label class=\"pin-note\"><textarea rows=\"2\">${(item.subNote||'').replace(/</g,'&lt;')}</textarea></label>`;
    pin.dataset.persistedTitle = item.title || '';
    pin.dataset.persistedSubNote = item.subNote || ''; 
    surface.appendChild(pin);
    setPinColor(pin, item.color || 'var(--c1)');
    setSlipping(pin, !!item.slipping);
    applyDistanceStyle(pin);
    bindPin(pin);
    pin.style.display = (!markSaved || lensExempt.has(item.id) || inLens(pin)) ? '' : 'none';
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
    const id = e.dataTransfer && e.dataTransfer.getData('text/orbit-hidden-id');
    if (!id) return;
    e.preventDefault();
    if (mode === 'focus') setDragHalo(false);
    const rect = surface.getBoundingClientRect();
    const x = Math.max(6, Math.min(surface.clientWidth - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(surface.clientHeight - 90, e.clientY - rect.top));
    const item = hiddenItemsCache.find(i => i.id === id);
    if (!item) return;
    await fetch('/api/items/unhide-at', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, contextId: currentContextId, x, y})});
    item.x = x; item.y = y;
    if (!surface.querySelector(`.pin[data-id="${id}"]`)) createPin(item, false, true);
    hiddenItemsCache = hiddenItemsCache.filter(i => i.id !== id);
    hiddenCount = Math.max(0, hiddenCount - 1);
    renderHiddenButton();
    if (hiddenItemsCache.length === 0) closeHiddenTray();
  });

  surface.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin') || e.target.closest('.toolbar') || e.target.closest('.hint') || e.target.closest('.undo-toast') || e.target.closest('.context-head') || e.target.closest('.hidden-tray') || e.target.closest('.context-confirm')) return;
    const rect = surface.getBoundingClientRect();
    const x = Math.max(6, Math.min(surface.clientWidth - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(surface.clientHeight - 90, e.clientY - rect.top));
    createPin({id: uid(), title: '', subNote: '', x, y, color: selectedPaletteColor(), slipping: false}, true, false);
    e.preventDefault();
  });

  if (surface.querySelector('.pin')) setActivePin(surface.querySelector('.pin'));
  renderHiddenButton();
  renderLensButtons();
  applyLens();

  window.addEventListener('resize', () => { surface.querySelectorAll('.pin').forEach(applyDistanceStyle); applyLens(); updateBoundaryCue(false); if (trayOpen) placeHiddenTray(); });
})();
