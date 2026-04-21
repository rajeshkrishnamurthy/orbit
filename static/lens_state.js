const LENS_MODE_STORAGE_KEY = 'orbit.lens-mode';

export function createLensStateController({
  surface,
  boundaryEl,
  filtersControls,
  mode,
  centerSemantics,
  syncCanvasViewportRect,
}) {
  const semanticContract = normalizeCenterSemantics(centerSemantics);
  const canonicalLensRatio = semanticContract ? semanticContract.lensRatio : 0.68;
  let staleActive = readStaleLensEnabled();
  let scopeLens = 'all';
  let lensRatio = canonicalLensRatio;
  const lensExempt = new Set();
  let staleLensSnapshot = new Set();
  const staleLensDetachedPins = new Map();
  let dragHaloActive = false;
  const additionalVisibilityPredicates = new Map();

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
        toggleStaleLens();
        return;
      }
      setScopeLens(name);
    };
    if (name === 'stale') lensWrap.appendChild(sliderWrap);
    lensWrap.appendChild(button);
  });
  filtersControls.appendChild(lensWrap);

  function readStaleLensEnabled() {
    try {
      return sessionStorage.getItem(LENS_MODE_STORAGE_KEY) === 'stale';
    } catch (_err) {
      return false;
    }
  }

  function persistLensMode() {
    try {
      if (staleActive) sessionStorage.setItem(LENS_MODE_STORAGE_KEY, 'stale');
      else sessionStorage.removeItem(LENS_MODE_STORAGE_KEY);
    } catch (_err) {}
  }

  function center() {
    const geometry = resolveSurfaceGeometry();
    return { x: geometry.centerX, y: geometry.centerY };
  }

  function maxR() {
    return resolveSurfaceGeometry().maxRadius;
  }

  function resolveSurfaceGeometry() {
    const surfaceWidth = surface.clientWidth || (semanticContract ? semanticContract.width : 0);
    const surfaceHeight = surface.clientHeight || (semanticContract ? semanticContract.height : 0);
    if (!(surfaceWidth > 0) || !(surfaceHeight > 0)) {
      return {
        centerX: 0,
        centerY: 0,
        maxRadius: 0,
      };
    }
    if (!semanticContract) {
      return {
        centerX: surfaceWidth / 2,
        centerY: surfaceHeight / 2,
        maxRadius: Math.min(surfaceWidth, surfaceHeight) * 0.42,
      };
    }
    const scaleX = surfaceWidth / semanticContract.width;
    const scaleY = surfaceHeight / semanticContract.height;
    const radiusScale = Math.min(scaleX, scaleY);
    return {
      centerX: semanticContract.centerX * scaleX,
      centerY: semanticContract.centerY * scaleY,
      maxRadius: semanticContract.maxRadius * radiusScale,
    };
  }

  function proximityFactor(distance) {
    const radius = maxR();
    if (!(radius > 0)) return 0;
    const normalized = Math.min(1, distance / radius);
    return 1 - normalized;
  }

  function pinDistanceFromCenter(pin) {
    const width = pin.offsetWidth || 180;
    const height = pin.offsetHeight || 72;
    const x = (parseFloat(pin.style.left) || 0) + width / 2;
    const y = (parseFloat(pin.style.top) || 0) + height / 2;
    const c = center();
    return Math.hypot(x - c.x, y - c.y);
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
    if (!staleActive) {
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

  function setScopeLens(nextScopeLens) {
    scopeLens = nextScopeLens;
    renderButtons();
    surface.querySelectorAll('.pin').forEach(applyDistanceStyle);
    applyLens();
    syncCanvasViewportRect();
  }

  function toggleStaleLens() {
    staleActive = !staleActive;
    if (staleActive) {
      captureStaleSnapshot();
    } else {
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
      if (button.dataset.lens === 'stale') {
        button.classList.toggle('active', staleActive);
        return;
      }
      button.classList.toggle('active', button.dataset.lens === scopeLens);
    });
    const slider = document.querySelector('.lens-slider-wrap');
    if (slider) slider.hidden = (scopeLens === 'all');
    updateBoundaryCue(false);
  }

  function inLens(pin) {
    if (scopeLens === 'all') return true;
    const distance = pinDistanceFromCenter(pin);
    const cutoff = maxR() * lensRatio;
    if (scopeLens === 'center') return distance <= cutoff;
    return distance > cutoff;
  }

  function isVisible(pin) {
    const id = pin.dataset.id;
    const scopeVisible = (scopeLens === 'all') ? true : (lensExempt.has(id) || inLens(pin));
    if (!scopeVisible) return false;
    if (staleActive && !staleLensSnapshot.has(id)) return false;
    for (const predicate of additionalVisibilityPredicates.values()) {
      if (predicate(pin) === false) return false;
    }
    return true;
  }

  function applyLens() {
    if (staleActive) syncStaleLensDom();
    else restoreDetachedStalePins();
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
    const shouldShow = forceShow || dragHaloActive || (scopeLens !== 'all');
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
    const cutoff = maxR() * lensRatio;
    const isCenterBand = distance <= cutoff;
    const proximity = proximityFactor(distance);

    let cardScale = isCenterBand ? 1.05 : 0.95;
    let titleSize = isCenterBand ? 14.7 : 12.3;
    let bodySize = isCenterBand ? 11.7 : 10.7;
    let titleWeight = isCenterBand ? 660 : 560;

    if (mode === 'focus' && scopeLens === 'periphery' && !isCenterBand) {
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
    return (!markSaved || isVisible(pin)) ? '' : 'none';
  }

  function setAdditionalVisibilityPredicate(keyOrPredicate, maybePredicate) {
    if (typeof keyOrPredicate === 'string') {
      const key = keyOrPredicate;
      if (typeof maybePredicate === 'function') additionalVisibilityPredicates.set(key, maybePredicate);
      else additionalVisibilityPredicates.delete(key);
      applyLens();
      return;
    }
    const defaultKey = '__default__';
    if (typeof keyOrPredicate === 'function') additionalVisibilityPredicates.set(defaultKey, keyOrPredicate);
    else additionalVisibilityPredicates.delete(defaultKey);
    applyLens();
  }

  return {
    applyDistanceStyle,
    applyLens,
    captureStaleSnapshot,
    forgetPin,
    getMode: () => (staleActive ? 'stale' : scopeLens),
    initialDisplayValue,
    isVisible,
    registerPin,
    renderButtons,
    setAdditionalVisibilityPredicate,
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
