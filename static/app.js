(() => {
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const items = window.__ITEMS__ || [];
  let activePin = null;
  const palette = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];

  toolbar.innerHTML = '<span style="font-size:12px;color:#c4cdef">Item color</span>';
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

  const center = () => ({x: surface.clientWidth/2, y: surface.clientHeight/2});
  const maxR = () => Math.min(surface.clientWidth, surface.clientHeight) * 0.42;
  function proximityFactor(d){ const t = Math.min(1, d / maxR()); return 1 - t; }

  function resolveCssColorToRgb(cssColor){
    const probe = document.createElement('span');
    probe.style.color = cssColor;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? {r:+m[1],g:+m[2],b:+m[3]} : {r:80,g:100,b:150};
  }

  function setPinColor(pin, color){
    pin.style.background = color;
    pin.dataset.color = color;
    const rgb = resolveCssColorToRgb(color);
    const luminance = (0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b)/255;
    const titleEl = pin.querySelector('.pin-title input');
    const noteEl = pin.querySelector('.pin-note input');
    if (luminance > 0.62){
      titleEl.style.color = '#0f1b2d';
      noteEl.style.color = '#1f2d45';
    } else {
      titleEl.style.color = '#fff';
      noteEl.style.color = '#eaf0ff';
    }
  }

  function applyDistanceStyle(pin){
    const w = pin.offsetWidth || 180, h = pin.offsetHeight || 72;
    const x = parseFloat(pin.style.left) || 0, y = parseFloat(pin.style.top) || 0;
    const c = center();
    const d = Math.hypot((x+w/2)-c.x, (y+h/2)-c.y);
    const p = proximityFactor(d);
    const cardScale = 0.92 + (p * 0.20);
    const titleSize = 12 + (p * 3.2);
    const bodySize = 10.5 + (p * 1.6);
    const titleWt = Math.round(540 + (p * 140));
    pin.style.transform = `scale(${cardScale.toFixed(3)})`;
    const title = pin.querySelector('.pin-title input');
    const note = pin.querySelector('.pin-note input');
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

  function uid(){ return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  const pending = new Map();
  function savePin(pin){
    const id = pin.dataset.id;
    const payload = {
      id,
      title: pin.querySelector('.pin-title input').value,
      subNote: pin.querySelector('.pin-note input').value,
      x: parseFloat(pin.style.left) || 0,
      y: parseFloat(pin.style.top) || 0,
      color: pin.dataset.color || 'var(--c1)'
    };
    clearTimeout(pending.get(id));
    pending.set(id, setTimeout(() => {
      fetch('/api/items', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
    }, 180));
  }

  function discardIfEmpty(pin){
    const title = pin.querySelector('.pin-title input').value.trim();
    const note = pin.querySelector('.pin-note input').value.trim();
    if (title || note) return;
    pin.classList.add('discarding');
    setTimeout(() => {
      fetch('/api/items/delete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id: pin.dataset.id})
      });
      if (activePin === pin) {
        activePin = null;
        refreshSwatches();
      }
      pin.remove();
    }, 130);
  }

  function bindPin(pin){
    pin.addEventListener('pointerdown', (e) => {
      activePin = pin;
      refreshSwatches();
      pin.classList.add('dragging');
      pin.setPointerCapture(e.pointerId);
      const rect = pin.getBoundingClientRect();
      const surfRect = surface.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      const onMove = (ev) => {
        const w = pin.offsetWidth || rect.width;
        const h = pin.offsetHeight || rect.height;
        const x = ev.clientX - surfRect.left - offsetX;
        const y = ev.clientY - surfRect.top - offsetY;
        pin.style.left = Math.max(6, Math.min(surface.clientWidth - w - 6, x)) + 'px';
        pin.style.top = Math.max(6, Math.min(surface.clientHeight - h - 6, y)) + 'px';
        applyDistanceStyle(pin);
      };

      const onUp = (ev) => {
        pin.classList.remove('dragging');
        pin.releasePointerCapture(ev.pointerId);
        pin.removeEventListener('pointermove', onMove);
        pin.removeEventListener('pointerup', onUp);
        pin.removeEventListener('pointercancel', onUp);
        applyDistanceStyle(pin);
        savePin(pin); // no snap/reassign/normalize
      };

      pin.addEventListener('pointermove', onMove);
      pin.addEventListener('pointerup', onUp);
      pin.addEventListener('pointercancel', onUp);
    });

    pin.querySelectorAll('input').forEach(input => {
      input.addEventListener('pointerdown', ev => ev.stopPropagation());
      input.addEventListener('input', () => { applyDistanceStyle(pin); savePin(pin); });
      input.addEventListener('focus', () => { activePin = pin; refreshSwatches(); });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          const focusedInside = pin.contains(document.activeElement);
          if (!focusedInside) discardIfEmpty(pin);
        }, 0);
      });
    });
  }

  function createPin(item, focusTitle = false){
    const pin = document.createElement('article');
    pin.className = 'pin';
    pin.dataset.id = item.id;
    pin.style.left = `${item.x}px`;
    pin.style.top = `${item.y}px`;
    pin.innerHTML = `<label class="pin-title"><input value="${(item.title||'').replace(/"/g,'&quot;')}" /></label><label class="pin-note"><input value="${(item.subNote||'').replace(/"/g,'&quot;')}" /></label>`;
    surface.appendChild(pin);
    setPinColor(pin, item.color || 'var(--c1)');
    applyDistanceStyle(pin);
    bindPin(pin);
    activePin = pin;
    refreshSwatches();
    if (focusTitle) {
      const titleInput = pin.querySelector('.pin-title input');
      titleInput.focus();
      titleInput.select();
    }
    return pin;
  }

  items.forEach((item) => createPin(item, false));

  surface.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin') || e.target.closest('.toolbar') || e.target.closest('.hint')) return;
    const rect = surface.getBoundingClientRect();
    const x = Math.max(6, Math.min(surface.clientWidth - 190, e.clientX - rect.left));
    const y = Math.max(6, Math.min(surface.clientHeight - 90, e.clientY - rect.top));
    const pin = createPin({id: uid(), title: '', subNote: '', x, y, color: 'var(--c1)'}, true);
    // no immediate save; save begins once user types/moves/colors. Empty blur discards.
    e.preventDefault();
  });

  if (surface.querySelector('.pin')) {
    activePin = surface.querySelector('.pin');
    refreshSwatches();
  }

  window.addEventListener('resize', () => surface.querySelectorAll('.pin').forEach(applyDistanceStyle));
})();
