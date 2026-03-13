(() => {
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const boundaryEl = document.createElement('div');
  boundaryEl.className = 'lens-boundary';
  surface.appendChild(boundaryEl);
  const items = window.__ITEMS__ || [];
  const mode = window.__MODE__ || 'focus';
  const currentContextId = window.__CURRENT_CONTEXT_ID__ || 'main-orbit';
  let hiddenCount = window.__HIDDEN_COUNT__ || 0;
  let lens = 'all';
  let lensRatio = 0.68;
  const lensExempt = new Set();
  let activePin = null;
  let undoState = null;
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];

  toolbar.innerHTML = '<span style="font-size:12px;color:#c4cdef">Item color</span>';
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
    if (mode !== 'focus' || hiddenCount <= 0) return;
    const res = await fetch('/api/items/reveal-all', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({contextId: currentContextId})});
    const data = await res.json();
    (data.items || []).forEach(it => {
      if (!surface.querySelector(`.pin[data-id="${it.id}"]`)) createPin(it, false, true);
    });
    hiddenCount = data.hiddenCount || 0;
    renderHiddenButton();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
  };
  toolbar.appendChild(hiddenBtn);
  if (mode !== 'focus') hiddenBtn.hidden = true;

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

  function setPinColor(pin, color){
    pin.style.background = color;
    pin.dataset.color = color;
    const rgb = resolveCssColorToRgb(color);
    const luminance = (0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b)/255;
    const titleEl = pin.querySelector('.pin-title input');
    const noteEl = pin.querySelector('.pin-note textarea');
    const delEl = pin.querySelector('.pin-delete');
    if (luminance > 0.62){
      titleEl.style.color = '#0f1b2d';
      noteEl.style.color = '#1f2d45';
      if (delEl) delEl.style.color = '#22395c';
    } else {
      titleEl.style.color = '#fff';
      noteEl.style.color = '#eaf0ff';
      if (delEl) delEl.style.color = '#f5f8ff';
    }
  }

  function applyDistanceStyle(pin){
    const w = pin.offsetWidth || 180, h = pin.offsetHeight || 72;
    const x = parseFloat(pin.style.left) || 0, y = parseFloat(pin.style.top) || 0;
    const c = center();
    const d = Math.hypot((x+w/2)-c.x, (y+h/2)-c.y);
    const p = proximityFactor(d);
    let cardScale = 0.92 + (p * 0.20);
    let titleSize = 12 + (p * 3.2);
    let bodySize = 10.5 + (p * 1.6);
    let titleWt = Math.round(540 + (p * 140));

    // Periphery lens readability lift: subtle floor for attended outer cards.
    if (mode === 'focus' && lens === 'periphery' && inLens(pin)) {
      cardScale = Math.max(cardScale, 0.97);
      titleSize = Math.max(titleSize, 12.8);
      bodySize = Math.max(bodySize, 11.1);
      titleWt = Math.max(titleWt, 590);
    }

    pin.style.transform = `scale(${cardScale.toFixed(3)})`;
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
    if (lens === 'all') { boundaryEl.classList.remove('show'); return; }
    const r = maxR() * lensRatio;
    boundaryEl.style.width = (r*2) + 'px';
    boundaryEl.style.height = (r*2) + 'px';
    if (forceShow) boundaryEl.classList.add('show');
    else boundaryEl.classList.toggle('show', lens !== 'all');
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
  function savePin(pin){
    const id = pin.dataset.id;
    const payload = {
      id,
      contextId: currentContextId,
      title: pin.querySelector('.pin-title input').value,
      subNote: pin.querySelector('.pin-note textarea').value,
      x: parseFloat(pin.style.left) || 0,
      y: parseFloat(pin.style.top) || 0,
      color: pin.dataset.color || 'var(--c1)'
    };
    clearTimeout(pending.get(id));
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
    fetch('/api/items/hide', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id: pin.dataset.id, contextId: currentContextId})
    }).then(async (r) => {
      const d = await r.json();
      hiddenCount = d.hiddenCount || (hiddenCount + 1);
      renderHiddenButton();
    });
    lensExempt.delete(pin.dataset.id);
    if (activePin === pin) setActivePin(null);
    pin.remove();
  }

  function deletePinImmediate(pin){
    const payload = {
      id: pin.dataset.id,
      title: pin.querySelector('.pin-title input').value,
      subNote: pin.querySelector('.pin-note textarea').value,
      x: parseFloat(pin.style.left) || 0,
      y: parseFloat(pin.style.top) || 0,
      color: pin.dataset.color || 'var(--c1)'
    };

    fetch(mode === 'focus' ? '/api/items/delete' : '/api/contexts/delete', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id: payload.id})
    });

    lensExempt.delete(pin.dataset.id);
    if (activePin === pin) setActivePin(null);
    pin.remove();
    if (mode === 'focus') showUndo(payload);
  }

  function clearUndo(){
    if (!undoState) return;
    clearTimeout(undoState.timer);
    undoState.el.remove();
    undoState = null;
  }

  function showUndo(payload){
    clearUndo();
    const el = document.createElement('div');
    el.className = 'undo-toast';
    el.innerHTML = '<span>Card deleted</span><button class="undo-btn">Undo</button>';
    const btn = el.querySelector('.undo-btn');
    btn.addEventListener('click', () => {
      createPin(payload, false, true);
      fetch(mode === 'focus' ? '/api/items' : '/api/contexts', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      clearUndo();
    });
    surface.appendChild(el);
    undoState = {
      el,
      timer: setTimeout(() => {
        clearUndo();
      }, 4000)
    };
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
    if (hide) {
      hide.addEventListener('pointerdown', ev => ev.stopPropagation());
      hide.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (mode !== 'focus' || pin.dataset.saved !== 'true') return;
        hidePinImmediate(pin);
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
        if (pin.dataset.saved !== 'true') return;
        deletePinImmediate(pin);
      });
    }

    pin.addEventListener('pointerdown', (e) => {
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
    if (markSaved) lensExempt.delete(item.id);
    else lensExempt.add(item.id);
    pin.dataset.saved = markSaved ? 'true' : 'false';
    pin.style.left = `${item.x}px`;
    pin.style.top = `${item.y}px`;
    const enterBtn = mode === 'contexts' ? '<button class=\"pin-enter\" aria-label=\"Enter context\" title=\"Enter\">→</button>' : '';
    const hideBtn = mode === 'focus' ? '<button class=\"pin-hide\" aria-label=\"Hide card\" title=\"Hide\">–</button>' : '';
    pin.innerHTML = `${hideBtn}${enterBtn}<button class=\"pin-delete\" aria-label=\"Delete card\" title=\"Delete\">×</button><label class=\"pin-title\"><input value=\"${(item.title||'').replace(/"/g,'&quot;')}\" /></label><label class=\"pin-note\"><textarea rows=\"2\">${(item.subNote||'').replace(/</g,'&lt;')}</textarea></label>`;
    pin.dataset.persistedTitle = item.title || '';
    pin.dataset.persistedSubNote = item.subNote || ''; 
    surface.appendChild(pin);
    setPinColor(pin, item.color || 'var(--c1)');
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

  surface.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin') || e.target.closest('.toolbar') || e.target.closest('.hint') || e.target.closest('.undo-toast') || e.target.closest('.context-head')) return;
    const rect = surface.getBoundingClientRect();
    const x = Math.max(6, Math.min(surface.clientWidth - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(surface.clientHeight - 90, e.clientY - rect.top));
    const np = createPin({id: uid(), title: mode==='contexts' ? 'New Context' : '', subNote: '', x, y, color: selectedPaletteColor()}, true, false);
    if (mode==='contexts') savePin(np);
    e.preventDefault();
  });

  if (surface.querySelector('.pin')) setActivePin(surface.querySelector('.pin'));
  renderHiddenButton();
  renderLensButtons();
  applyLens();

  window.addEventListener('resize', () => { surface.querySelectorAll('.pin').forEach(applyDistanceStyle); applyLens(); updateBoundaryCue(false); });
})();
