(() => {
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const items = (window.__ITEMS__ || []).filter(Boolean);
  const mode = window.__MODE__ || 'focus';
  const contextNameEl = document.getElementById('context-name');
  const openContextsEl = document.getElementById('open-contexts');

  // Read-only companion posture
  if (contextNameEl) contextNameEl.contentEditable = 'false';
  if (openContextsEl) {
    if (mode === 'focus') openContextsEl.onclick = () => { location.href = '/?canvas=contexts&ctx=' + encodeURIComponent(window.__CURRENT_CONTEXT_ID__ || 'main-orbit') + '&mobile=1'; };
    else openContextsEl.hidden = true;
  }

  toolbar.innerHTML = '';
  const tabs = document.createElement('div');
  tabs.className = 'mobile-lens-tabs';
  const bCenter = document.createElement('button'); bCenter.className = 'mobile-lens-tab active'; bCenter.textContent = 'Center';
  const bPeri = document.createElement('button'); bPeri.className = 'mobile-lens-tab'; bPeri.textContent = 'Periphery';
  tabs.appendChild(bCenter); tabs.appendChild(bPeri);
  toolbar.appendChild(tabs);

  const coreVoid = document.createElement('div');
  coreVoid.className = 'mobile-core-void';
  surface.appendChild(coreVoid);

  let lens = 'center';
  const lensRatio = 0.68;

  function center(){ return {x: surface.clientWidth/2, y: surface.clientHeight/2}; }
  function maxR(){ return Math.min(surface.clientWidth, surface.clientHeight) * 0.42; }
  function isCenter(item){
    const c = center();
    const d = Math.hypot((item.x||0)-c.x, (item.y||0)-c.y);
    return d <= maxR() * lensRatio;
  }

  function render(){
    surface.querySelectorAll('.mobile-pin').forEach(n => n.remove());
    const c = center();
    const field = Math.min(surface.clientWidth, surface.clientHeight);
    const filtered = items.filter(it => lens === 'center' ? isCenter(it) : !isCenter(it));

    filtered.forEach((it) => {
      const dx = (it.x||c.x)-c.x;
      const dy = (it.y||c.y)-c.y;
      const ang = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      const cut = maxR() * lensRatio;
      let nx, ny;

      if (lens === 'center') {
        const norm = Math.min(1, dist / Math.max(1, cut));
        const r = field * (0.12 + 0.22 * norm);
        nx = c.x + Math.cos(ang) * r;
        ny = c.y + Math.sin(ang) * r;
      } else {
        const norm = Math.min(1, (dist - cut) / Math.max(1, maxR() - cut));
        const r = field * (0.60 + 0.28 * Math.max(0, norm));
        nx = c.x + Math.cos(ang) * r;
        ny = c.y + Math.sin(ang) * r;
      }

      const pin = document.createElement('article');
      pin.className = 'mobile-pin ' + (lens === 'periphery' ? 'periphery' : 'center');
      pin.style.left = Math.max(8, Math.min(surface.clientWidth - 164, nx - 70)) + 'px';
      pin.style.top = Math.max(56, Math.min(surface.clientHeight - 78, ny - 28)) + 'px';
      pin.innerHTML = `<b>${(it.title||'Untitled')}</b><p>${(it.subNote||'')}</p>`;
      surface.appendChild(pin);
    });

    bCenter.classList.toggle('active', lens === 'center');
    bPeri.classList.toggle('active', lens === 'periphery');
  }

  bCenter.onclick = () => { lens = 'center'; render(); };
  bPeri.onclick = () => { lens = 'periphery'; render(); };

  // disable desktop interactions in read-only mode
  surface.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mobile-pin') || e.target.closest('.mobile-lens-tabs') || e.target.closest('.context-head')) return;
    e.preventDefault();
  });

  render();
  window.addEventListener('resize', render);
})();
