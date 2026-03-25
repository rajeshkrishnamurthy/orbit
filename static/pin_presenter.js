function resolveCssColorToRgb(documentRef, cssColor) {
  const probe = documentRef.createElement('span');
  probe.style.color = cssColor;
  documentRef.body.appendChild(probe);
  const computedColor = getComputedStyle(probe).color;
  probe.remove();
  const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return match ? {r: +match[1], g: +match[2], b: +match[3]} : {r: 80, g: 100, b: 150};
}

function rgbToHsl(rgb) {
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

function hslToRgb(hsl) {
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function deriveTouchColors(rgb, luminance) {
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
    l: clamp01(hsl.l + direction * (isBright ? 0.10 + contrast * 0.03 : 0.12 + contrast * 0.03)),
  });
  const halo = hslToRgb({
    h: hsl.h,
    s: clamp01(hsl.s * (isBright ? 1.18 : 1.04) + 0.04),
    l: clamp01(hsl.l + direction * (isBright ? 0.22 + contrast * 0.08 : 0.18 + contrast * 0.06)),
  });
  return {accent, halo, ringSpread, ringAlpha, blurAlpha};
}

export function createPinPresenter({documentRef, mode}) {
  function syncTouchState(pin) {
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

  function setPinColor(pin, color) {
    pin.style.background = color;
    pin.dataset.color = color;
    const rgb = resolveCssColorToRgb(documentRef, color);
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
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
    if (luminance > 0.62) {
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

  function applyTouchResponse(pin, data) {
    if (!pin || !data) return;
    if (typeof data.touchedToday === 'boolean') pin.dataset.touchedToday = data.touchedToday ? 'true' : 'false';
    if (Number.isFinite(Number(data.touchCount7d))) pin.dataset.touchCount7d = String(Number(data.touchCount7d));
    if (typeof data.lastTouchedDay === 'string') pin.dataset.lastTouchedDay = data.lastTouchedDay;
    if (typeof data.active === 'boolean') pin.dataset.active = data.active ? 'true' : 'false';
    if (typeof data.stale === 'boolean') pin.dataset.stale = data.stale ? 'true' : 'false';
    if (typeof data.inCenter === 'boolean') pin.dataset.inCenter = data.inCenter ? 'true' : 'false';
    syncTouchState(pin);
  }

  return {
    applyTouchResponse,
    setPinColor,
    syncTouchState,
  };
}
