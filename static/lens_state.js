const LENS_MODE_STORAGE_KEY = 'orbit.lens-mode';

export function createLensStateController({
  surface,
  boundaryEl,
  filtersControls,
  mode,
  centerSemantics,
  syncCanvasViewportRect,
  syncTouchState,
}) {
  const semanticContract = normalizeCenterSemantics(centerSemantics);
  const canonicalLensRatio = semanticContract ? semanticContract.lensRatio : 0.68;
  let lens = readLensMode();
  let lensRatio = canonicalLensRatio;
  const lensExempt = new Set();
  let staleLensSnapshot = new Set();
  const staleLensDetachedPins = new Map();
  let dragHaloActive = false;

  const lensWrap = document.createElement('div');
  lensWrap.className = 'lens-toggle';

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'lens-slider-wrap';
  sliderWrap.hidden = true;
  sliderWrap.innerHTML = '<input class="lens-slider" type="range" min="35" max="85" value="68" step="1" aria-label="Lens sensitivity" />';
  const lensSlider = sliderWrap.querySelector('.lens-slider');
  lensSlider.value = String(Math.round(Math.max(0.35, Math.min(0.85, lensRatio)) * 100));
  lensSlider.addEventListener('input', () => {
    lensRatio = Number(lensSlider.value) / 100;
    updateBoundaryCue(true);
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
  });
  lensSlider.addEventListener('pointerdown', () => updateBoundaryCue(true));
  lensSlider.addEventListener('pointerup', () => setTimeout(() => updateBoundaryCue(false), 380));

  ['all', 'center', 'periphery', 'stale'].forEach((name) => {
    const button = document.createElement('button');
    button.className = 'lens-btn';
    button.dataset.lens = name;
    button.textContent = name[0].toUpperCase() + name.slice(1);
    button.onclick = () => {
      if (name === 'stale') {
        setLensMode(lens === 'stale' ? 'all' : 'stale');
        return;
      }
      setLensMode(name);
    };
    if (name === 'stale') lensWrap.appendChild(sliderWrap);
    lensWrap.appendChild(button);
  });
  filtersControls.appendChild(lensWrap);

  function readLensMode() {
    try {
      const stored = sessionStorage.getItem(LENS_MODE_STORAGE_KEY);
      return stored === 'stale' ? 'stale' : 'all';
    } catch (_err) {
      return 'all';
    }
  }

  function persistLensMode() {
    try {
      if (lens === 'stale') sessionStorage.setItem(LENS_MODE_STORAGE_KEY, 'stale');
      else sessionStorage.removeItem(LENS_MODE_STORAGE_KEY);
    } catch (_err) {}
  }

  function center() {
    if (semanticContract) {
      return { x: semanticContract.centerX, y: semanticContract.centerY };
    }
    return { x: surface.clientWidth / 2, y: surface.clientHeight / 2 };
  }

  function maxR() {
    if (semanticContract) return semanticContract.maxRadius;
    return Math.min(surface.clientWidth, surface.clientHeight) * 0.42;
  }

  function proximityFactor(distance) {
    const normalized = Math.min(1, distance / maxR());
    return 1 - normalized;
  }

  function pinDistanceFromCenter(pin) {
    const x = parseFloat(pin.style.left) || 0;
    const y = parseFloat(pin.style.top) || 0;
    if (semanticContract) {
      return Math.hypot(x - semanticContract.centerX, y - semanticContract.centerY);
    }
    const width = pin.offsetWidth || 180;
    const height = pin.offsetHeight || 72;
    return Math.hypot((x + width / 2) - center().x, (y + height / 2) - center().y);
  }

  function readStaleLensSnapshot() {
    return [...surface.querySelectorAll('.pin[data-stale="true"]')]
      .map((pin) => pin.dataset.id)
      .filter((id) => typeof id === 'string' && id.length > 0);
  }

  function captureStaleSnapshot() {
    staleLensSnapshot = new Set(readStaleLensSnapshot());
  }

  function restoreDetachedStalePins() {
    if (!staleLensDetachedPins.size) return;
    for (const [id, pin] of staleLensDetachedPins.entries()) {
      if (pin.isConnected) continue;
      pin.style.display = '';
      surface.appendChild(pin);
      staleLensDetachedPins.delete(id);
    }
  }

  function syncStaleLensDom() {
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

  function setLensMode(nextLens) {
    lens = nextLens;
    if (lens === 'stale') {
      captureStaleSnapshot();
    } else {
      lensExempt.clear();
      staleLensSnapshot.clear();
      restoreDetachedStalePins();
    }
    persistLensMode();
    renderButtons();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    syncCanvasViewportRect();
  }

  function renderButtons() {
    document.querySelectorAll('.lens-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.lens === lens);
    });
    const slider = document.querySelector('.lens-slider-wrap');
    if (slider) slider.hidden = (lens === 'all' || lens === 'stale');
    updateBoundaryCue(false);
  }

  function inLens(pin) {
    if (lens === 'all') return true;
    const distance = pinDistanceFromCenter(pin);
    const cutoff = maxR() * (semanticContract ? canonicalLensRatio : lensRatio);
    if (lens === 'center') return distance <= cutoff;
    return distance > cutoff;
  }

  function isVisible(pin) {
    const id = pin.dataset.id;
    if (lens === 'all') return true;
    if (lens === 'stale') return staleLensSnapshot.has(id);
    return lensExempt.has(id) || inLens(pin);
  }

  function applyLens() {
    if (lens === 'stale') {
      syncStaleLensDom();
      return;
    }
    restoreDetachedStalePins();
    surface.querySelectorAll('.pin').forEach((pin) => {
      pin.style.display = isVisible(pin) ? '' : 'none';
    });
  }

  function updateBoundaryCue(forceShow) {
    if (!boundaryEl) return;
    const radius = maxR() * lensRatio;
    surface.style.setProperty('--center-radius', radius + 'px');
    boundaryEl.style.width = (radius * 2) + 'px';
    boundaryEl.style.height = (radius * 2) + 'px';
    const shouldShow = forceShow || dragHaloActive || (lens !== 'all' && lens !== 'stale');
    boundaryEl.classList.toggle('show', shouldShow);
  }

  function setDragHalo(active) {
    if (dragHaloActive === active) return;
    dragHaloActive = active;
    surface.classList.toggle('focus-emphasis', active);
    updateBoundaryCue(false);
  }

  function applyDistanceStyle(pin) {
    const distance = pinDistanceFromCenter(pin);
    const cutoff = maxR() * (semanticContract ? canonicalLensRatio : lensRatio);
    const isCenterBand = distance <= cutoff;
    const proximity = proximityFactor(distance);

    let cardScale = isCenterBand ? 1.05 : 0.95;
    let titleSize = isCenterBand ? 14.7 : 12.3;
    let bodySize = isCenterBand ? 11.7 : 10.7;
    let titleWeight = isCenterBand ? 660 : 560;

    if (mode === 'focus' && lens === 'periphery' && !isCenterBand) {
      cardScale = Math.max(cardScale, 0.98);
      titleSize = Math.max(titleSize, 12.9);
      bodySize = Math.max(bodySize, 11.1);
      titleWeight = Math.max(titleWeight, 600);
    }

    pin.style.transform = `scale(${cardScale.toFixed(3)})`;
    if (mode === 'focus') {
      pin.dataset.band = isCenterBand ? 'center' : 'periphery';
      const saturation = isCenterBand ? (0.96 + proximity * 0.05) : (0.88 + proximity * 0.05);
      const brightness = isCenterBand ? (0.98 + proximity * 0.04) : (0.95 + proximity * 0.04);
      const alpha = isCenterBand ? (0.97 + proximity * 0.03) : (0.88 + proximity * 0.06);
      pin.style.setProperty('--pin-sat', saturation.toFixed(3));
      pin.style.setProperty('--pin-bright', brightness.toFixed(3));
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
    title.style.fontWeight = String(titleWeight);
    note.style.fontSize = `${bodySize.toFixed(2)}px`;
    note.style.fontWeight = '480';
    syncTouchState(pin);
  }

  function registerPin(id, markSaved) {
    if (markSaved) lensExempt.delete(id);
    else lensExempt.add(id);
  }

  function forgetPin(id) {
    lensExempt.delete(id);
    staleLensDetachedPins.delete(id);
  }

  function initialDisplayValue(pin, markSaved) {
    return (lens === 'stale' ? isVisible(pin) : (!markSaved || isVisible(pin))) ? '' : 'none';
  }

  return {
    applyDistanceStyle,
    applyLens,
    captureStaleSnapshot,
    forgetPin,
    getMode: () => lens,
    initialDisplayValue,
    isVisible,
    registerPin,
    renderButtons,
    setDragHalo,
    updateBoundaryCue,
  };
}

function normalizeCenterSemantics(input) {
  if (!input || typeof input !== 'object') return null;

  const width = readFiniteNumber(input.width, input.desktopWidth, input.canvasWidth);
  const height = readFiniteNumber(input.height, input.desktopHeight, input.canvasHeight);
  if (!(width > 0) || !(height > 0)) return null;

  const centerX = readFiniteNumber(input.centerX, input.cx);
  const centerY = readFiniteNumber(input.centerY, input.cy);
  const maxRadius = readFiniteNumber(input.maxRadius);
  const maxRadiusRatio = readFiniteNumber(input.maxRadiusRatio, input.radiusRatio, input.radiusScale);
  const lensRatio = readFiniteNumber(input.lensRatio, input.centerRatio);

  const resolvedCenterX = Number.isFinite(centerX) ? centerX : (width / 2);
  const resolvedCenterY = Number.isFinite(centerY) ? centerY : (height / 2);
  const resolvedMaxRadius = Number.isFinite(maxRadius)
    ? maxRadius
    : (Math.min(width, height) * (Number.isFinite(maxRadiusRatio) ? maxRadiusRatio : 0.42));
  const resolvedLensRatio = Math.max(0.35, Math.min(0.85, Number.isFinite(lensRatio) ? lensRatio : 0.68));

  return {
    width,
    height,
    centerX: resolvedCenterX,
    centerY: resolvedCenterY,
    maxRadius: resolvedMaxRadius,
    lensRatio: resolvedLensRatio,
  };
}

function readFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}
