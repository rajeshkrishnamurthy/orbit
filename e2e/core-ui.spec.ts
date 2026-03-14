import { expect, test, type Page, type Locator } from '@playwright/test';

async function createCard(page: Page, title: string, x = 1050, y = 620): Promise<Locator> {
  const pins = page.locator('.pin');
  const before = await pins.count();
  const positions = [
    { x, y },
    { x: 1180, y: 680 },
    { x: 1180, y: 120 },
    { x: 90, y: 680 },
    { x: 90, y: 120 },
    { x: 720, y: 680 },
    { x: 720, y: 120 },
  ];
  let added = false;
  for (const p of positions) {
    await page.locator('#surface').click({ position: p });
    for (let i = 0; i < 8; i++) {
      if ((await pins.count()) === before + 1) {
        added = true;
        break;
      }
      await page.waitForTimeout(120);
    }
    if (added) break;
  }
  expect(added).toBeTruthy();

  const pin = pins.nth(before);
  const titleInput = pin.locator('.pin-title input');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await titleInput.blur();
  await page.waitForTimeout(350);
  return pin;
}

async function createContext(page: Page, title: string, x = 960, y = 620): Promise<Locator> {
  const pins = page.locator('.pin');
  const before = await pins.count();
  const positions = [
    { x, y },
    { x: 1120, y: 640 },
    { x: 240, y: 640 },
    { x: 1120, y: 140 },
    { x: 240, y: 140 },
  ];
  let added = false;
  for (const p of positions) {
    await page.locator('#surface').click({ position: p });
    for (let i = 0; i < 8; i++) {
      if ((await pins.count()) === before + 1) {
        added = true;
        break;
      }
      await page.waitForTimeout(120);
    }
    if (added) break;
  }
  expect(added).toBeTruthy();

  const pin = pins.nth(before);
  const titleInput = pin.locator('.pin-title input');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await titleInput.blur();
  await page.waitForTimeout(420);
  return pin;
}

async function dragBy(page: Page, pin: Locator, dx: number, dy: number): Promise<void> {
  const box = await pin.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function visiblePinIds(page: Page): Promise<string[]> {
  return page.$$eval('.pin', (nodes) =>
    nodes
      .filter((n) => getComputedStyle(n).display !== 'none')
      .map((n) => (n as HTMLElement).dataset.id || ''),
  );
}

async function setLensSlider(page: Page, value: number): Promise<void> {
  await page.locator('.lens-slider').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(180);
}

async function getHiddenCount(page: Page): Promise<number> {
  const toggle = page.locator('#hidden-toggle');
  const exists = await toggle.count();
  if (exists === 0) return 0;
  const hidden = await toggle.evaluate((el) => (el as HTMLButtonElement).hidden);
  if (hidden) return 0;
  const text = (await toggle.textContent()) ?? '';
  const match = text.match(/\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#surface')).toBeVisible();
  await expect(page.locator('.pin').first()).toBeVisible();
});

test('adds a new card on empty canvas click', async ({ page }) => {
  const pins = page.locator('.pin');
  const before = await pins.count();

  await page.locator('#surface').click({ position: { x: 1120, y: 660 } });
  await expect(pins).toHaveCount(before + 1);

  const newPin = pins.nth(before);
  await expect(newPin.locator('.pin-title input')).toBeFocused();
});

test('drag/drop persists card position after reload', async ({ page }) => {
  const pin = await createCard(page, `drag-${Date.now()}`);
  const id = await pin.getAttribute('data-id');
  expect(id).toBeTruthy();

  await dragBy(page, pin, -220, -130);

  const leftBefore = await pin.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const topBefore = await pin.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  await page.reload();
  const reloaded = page.locator(`.pin[data-id="${id}"]`);
  await expect(reloaded).toHaveCount(1);

  const leftAfter = await reloaded.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const topAfter = await reloaded.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  expect(Math.abs(leftAfter - leftBefore)).toBeLessThan(1.5);
  expect(Math.abs(topAfter - topBefore)).toBeLessThan(1.5);
});

test('center/periphery lens + slider updates visible card set', async ({ page }) => {
  const total = await page.locator('.pin').count();
  expect(total).toBeGreaterThan(1);

  await page.locator('.lens-btn[data-lens="center"]').click();
  await setLensSlider(page, 68);
  const center68 = await visiblePinIds(page);

  await setLensSlider(page, 35);
  const center35 = await visiblePinIds(page);

  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await setLensSlider(page, 68);
  const periphery68 = await visiblePinIds(page);

  expect(center68.length).toBeGreaterThan(0);
  expect(center68.length).toBeLessThan(total);
  expect(periphery68.length).toBeGreaterThan(0);
  expect(periphery68.length).toBeLessThan(total);
  expect(center35.length).not.toBe(center68.length);
});

test('card color change persists after reload', async ({ page }) => {
  const pin = await createCard(page, `color-${Date.now()}`, 1180, 240);

  const before = (await pin.getAttribute('data-color')) ?? '';
  const swatches = page.locator('.sw');
  const count = await swatches.count();

  let changed = false;
  let after = before;
  for (let i = 0; i < count; i++) {
    await swatches.nth(i).click();
    await page.waitForTimeout(220);
    after = (await pin.getAttribute('data-color')) ?? '';
    if (after !== before) {
      changed = true;
      break;
    }
  }

  expect(changed).toBeTruthy();
  const id = await pin.getAttribute('data-id');

  await page.reload();
  const reloaded = page.locator(`.pin[data-id="${id}"]`);
  await expect(reloaded).toHaveCount(1);
  await expect(reloaded).toHaveAttribute('data-color', after);
});

test('hide/unhide updates hidden tray count accurately', async ({ page }) => {
  const title = `hide-${Date.now()}`;
  const created = await createCard(page, title);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  const initialCount = await getHiddenCount(page);

  await created.hover();
  await created.locator('.pin-hide').click({ force: true });
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);

  await expect.poll(() => getHiddenCount(page)).toBe(initialCount + 1);

  const hiddenToggle = page.locator('#hidden-toggle');
  await hiddenToggle.click();

  const hiddenItem = page.locator('.hidden-tray-item', { hasText: title }).first();
  await expect(hiddenItem).toBeVisible();

  await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
  await expect.poll(() => getHiddenCount(page)).toBe(initialCount);
});

test('context delete requires confirmation and cancel keeps context', async ({ page }) => {
  await page.goto('/?canvas=contexts');
  await expect(page.locator('#surface')).toBeVisible();

  const pin = await createContext(page, `ctx-delete-${Date.now()}`);
  const id = await pin.getAttribute('data-id');
  expect(id).toBeTruthy();

  await pin.hover();
  await pin.locator('.pin-delete').click({ force: true });
  await expect(page.locator('.context-confirm')).toBeVisible();

  await page.locator('#context-confirm-cancel').click();
  await expect(page.locator('.context-confirm')).toBeHidden();
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);

  const samePin = page.locator(`.pin[data-id="${id}"]`);
  await samePin.hover();
  await samePin.locator('.pin-delete').click({ force: true });
  await expect(page.locator('.context-confirm')).toBeVisible();
  await page.locator('#context-confirm-delete').click();

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
});

test('enter context navigates to associated focus canvas', async ({ page }) => {
  await page.goto('/?canvas=contexts');
  const title = `ctx-enter-${Date.now()}`;
  const pin = await createContext(page, title, 980, 560);
  const id = await pin.getAttribute('data-id');
  expect(id).toBeTruthy();

  await pin.hover();
  await pin.locator('.pin-enter').click({ force: true });

  await expect(page).toHaveURL(new RegExp(`[?&]ctx=${id}`));
  await expect(page).not.toHaveURL(/canvas=contexts/);
  await expect(page.locator('#context-name')).toHaveText(title);
});

test('context title is editable in focus view and persists after reload', async ({ page }) => {
  const newTitle = `Main Orbit ${Date.now()}`;
  const name = page.locator('#context-name');
  await expect(name).toBeVisible();

  await name.focus();
  await name.evaluate((el, value) => {
    el.textContent = String(value);
    (el as HTMLElement).blur();
  }, newTitle);
  await page.locator('#surface').click({ position: { x: 1180, y: 660 } });
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.locator('#context-name')).toHaveText(newTitle);
});

test('card note height increases from one line to two lines', async ({ page }) => {
  const pin = page.locator('.pin').first();
  await expect(pin).toBeVisible();
  const note = pin.locator('.pin-note textarea');

  await note.fill('one line');
  await note.blur();
  await page.waitForTimeout(140);
  const oneLineHeight = await note.evaluate((el) => parseFloat((el as HTMLTextAreaElement).style.height || '0'));

  await note.fill('line one\nline two\nline three');
  await note.blur();
  await page.waitForTimeout(140);
  const multiLineHeight = await note.evaluate((el) => parseFloat((el as HTMLTextAreaElement).style.height || '0'));

  expect(oneLineHeight).toBeGreaterThanOrEqual(18);
  expect(multiLineHeight).toBeLessThanOrEqual(36);
  expect(multiLineHeight).toBeGreaterThanOrEqual(oneLineHeight);
});

test('center cards render larger than periphery cards', async ({ page }) => {
  const metrics = await page.$$eval('.pin', (nodes) => {
    const surface = document.getElementById('surface') as HTMLElement;
    const cx = surface.clientWidth / 2;
    const cy = surface.clientHeight / 2;
    return nodes.map((el) => {
      const node = el as HTMLElement;
      const left = parseFloat(node.style.left || '0');
      const top = parseFloat(node.style.top || '0');
      const w = node.offsetWidth || 180;
      const h = node.offsetHeight || 72;
      const d = Math.hypot((left + w / 2) - cx, (top + h / 2) - cy);
      const title = node.querySelector('.pin-title input') as HTMLInputElement;
      const body = node.querySelector('.pin-note textarea') as HTMLTextAreaElement;
      const m = (node.style.transform || '').match(/scale\(([\d.]+)\)/);
      return {
        d,
        scale: m ? Number(m[1]) : 1,
        titleSize: parseFloat(title.style.fontSize || '0'),
        bodySize: parseFloat(body.style.fontSize || '0'),
      };
    });
  });

  expect(metrics.length).toBeGreaterThan(1);
  const sorted = [...metrics].sort((a, b) => a.d - b.d);
  const near = sorted[0];
  const far = sorted[sorted.length - 1];

  const uniqueScales = new Set(metrics.map((m) => m.scale.toFixed(3)));
  expect(uniqueScales.size).toBeGreaterThan(1);
  expect(near.scale).toBeGreaterThanOrEqual(far.scale);
  expect(near.titleSize).toBeGreaterThanOrEqual(far.titleSize);
  expect(near.bodySize).toBeGreaterThanOrEqual(far.bodySize);
});
