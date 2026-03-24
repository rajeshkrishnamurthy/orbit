(() => {
  const surface = document.getElementById('surface');
  const toolbar = document.getElementById('toolbar');
  const items = (window.__ITEMS__ || []).filter(Boolean);
  const mode = window.__MODE__ || 'focus';
  const contextNameEl = document.getElementById('context-name');
  const openContextsEl = document.getElementById('open-contexts');
  const centerSemantics = readCenterSemantics();

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

  const DESKTOP_WIDTH = readNumeric(centerSemantics && centerSemantics.desktopWidth, centerSemantics && centerSemantics.canvasWidth, 1272);
  const DESKTOP_HEIGHT = readNumeric(centerSemantics && centerSemantics.desktopHeight, centerSemantics && centerSemantics.canvasHeight, 740);
  const DESKTOP_CX = readNumeric(centerSemantics && centerSemantics.centerX, DESKTOP_WIDTH / 2);
  const DESKTOP_CY = readNumeric(centerSemantics && centerSemantics.centerY, DESKTOP_HEIGHT / 2);

  function desktopPolar(item){
    const dx = (item.x || DESKTOP_CX) - DESKTOP_CX;
    const dy = (item.y || DESKTOP_CY) - DESKTOP_CY;
    return { angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
  }

  function render(){
    surface.querySelectorAll('.mobile-pin').forEach(n => n.remove());
    const c = {x: surface.clientWidth/2, y: surface.clientHeight/2};
    const field = Math.min(surface.clientWidth, surface.clientHeight);
    const filtered = items.filter(it => lens === 'center' ? !!it.inCenter : !it.inCenter);

    filtered.forEach((it) => {
      const { angle: ang, dist } = desktopPolar(it);
      const desktopMax = Math.hypot(
        Math.max(DESKTOP_CX, DESKTOP_WIDTH - DESKTOP_CX),
        Math.max(DESKTOP_CY, DESKTOP_HEIGHT - DESKTOP_CY),
      );
      const normDist = Math.min(1, dist / Math.max(1, desktopMax));
      let nx, ny;

      if (lens === 'center') {
        const r = field * (0.12 + 0.22 * normDist);
        nx = c.x + Math.cos(ang) * r;
        ny = c.y + Math.sin(ang) * r;
      } else {
        const r = field * (0.58 + 0.30 * normDist);
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

  function readCenterSemantics() {
    const semantics = window.__CENTER_SEMANTICS__;
    return semantics && typeof semantics === 'object' ? semantics : null;
  }

  function readNumeric(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }
})();
