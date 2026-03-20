import { execFileSync } from 'node:child_process';
import path from 'node:path';
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

async function openActionDrawer(pin: Locator): Promise<void> {
  const host = pin.locator('.pin-action-host');
  await expect(host).toBeVisible();
  await host.hover();
  await expect(pin.locator('.pin-action-drawer')).toBeVisible();
}

async function pinChrome(pin: Locator): Promise<{ borderColor: string; boxShadow: string }> {
  return pin.evaluate((el) => {
    const style = getComputedStyle(el as HTMLElement);
    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
    };
  });
}

function sqliteDbPath(): string {
  return path.join(process.cwd(), '.e2e-data', 'orbit.db');
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function ageCardInDb(id: string, daysAgo: number): void {
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const sql = `UPDATE items SET created_at=${sqlLiteral(when)} WHERE id=${sqlLiteral(id)};`;
  execFileSync('sqlite3', [sqliteDbPath(), sql], { stdio: 'pipe' });
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

  const normalize = (ids: string[]) => [...new Set(ids)].sort().join(',');
  expect(center68.length).toBeGreaterThan(0);
  expect(center68.length).toBeLessThan(total);
  expect(periphery68.length).toBeGreaterThan(0);
  expect(periphery68.length).toBeLessThan(total);
  expect(normalize(center35)).toBeTruthy();
});

test('stale lens shows only entry-time stale cards and refreshes on reload', async ({ page }) => {
  await page.goto('/?canvas=contexts');
  await expect(page.locator('#surface')).toBeVisible();

  const contextTitle = `stale-lens-context-${Date.now()}`;
  const contextPin = await createContext(page, contextTitle, 980, 560);
  const contextId = await contextPin.getAttribute('data-id');
  expect(contextId).toBeTruthy();
  await contextPin.hover();
  await contextPin.locator('.pin-enter').click({ force: true });
  await expect(page).toHaveURL(new RegExp(`[?&]ctx=${contextId}`));
  await expect(page.locator('#context-name')).toHaveText(contextTitle);

  const staleTitle = `stale-lens-stale-${Date.now()}`;
  const activeTitle = `stale-lens-active-${Date.now()}`;

  const stalePin = await createCard(page, staleTitle, 1120, 260);
  const activePin = await createCard(page, activeTitle, 900, 260);
  const staleId = await stalePin.getAttribute('data-id');
  const activeId = await activePin.getAttribute('data-id');
  expect(staleId).toBeTruthy();
  expect(activeId).toBeTruthy();

  ageCardInDb(staleId!, 8);
  await page.reload();

  const staleReloaded = page.locator(`.pin[data-id="${staleId}"]`);
  const activeReloaded = page.locator(`.pin[data-id="${activeId}"]`);
  await expect(staleReloaded).toHaveAttribute('data-stale', 'true');
  await expect(activeReloaded).toHaveAttribute('data-stale', 'false');

  const staleLens = page.locator('.lens-btn[data-lens="stale"]');
  await expect(staleLens).toBeVisible();
  await staleLens.click();
  await expect(staleLens).toHaveClass(/active/);

  await expect(activeReloaded).toHaveCount(0);
  let visible = await visiblePinIds(page);
  expect(visible).toEqual([staleId!]);

  await staleReloaded.locator('.pin-touch').click();
  await expect(staleReloaded).toHaveAttribute('data-stale', 'false');
  visible = await visiblePinIds(page);
  expect(visible).toEqual([staleId!]);

  ageCardInDb(activeId!, 8);
  visible = await visiblePinIds(page);
  expect(visible).toEqual([staleId!]);

  await page.reload();

  await expect(staleLens).toHaveClass(/active/);
  await expect(staleReloaded).toHaveCount(0);
  await expect(activeReloaded).toHaveAttribute('data-stale', 'true');
  visible = await visiblePinIds(page);
  expect(visible).toEqual([activeId!]);
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

  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
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

test('hide/unhide preserves stale state', async ({ page }) => {
  const title = `hide-stale-${Date.now()}`;
  const created = await createCard(page, title);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  ageCardInDb(id!, 8);
  await page.reload();

  const staleCard = page.locator(`.pin[data-id="${id}"]`);
  await expect(staleCard).toHaveAttribute('data-stale', 'true');

  const initialCount = await getHiddenCount(page);

  await openActionDrawer(staleCard);
  await staleCard.locator('.pin-action-drawer .pin-hide').click();
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);

  await expect.poll(() => getHiddenCount(page)).toBe(initialCount + 1);

  const hiddenToggle = page.locator('#hidden-toggle');
  await hiddenToggle.click();

  const hiddenItem = page.locator('.hidden-tray-item', { hasText: title }).first();
  await expect(hiddenItem).toBeVisible();

  await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

  const restored = page.locator(`.pin[data-id="${id}"]`);
  await expect(restored).toHaveCount(1);
  await expect(restored).toHaveAttribute('data-stale', 'true');
  await expect.poll(() => getHiddenCount(page)).toBe(initialCount);
});

test('focus cards use top-right hover drawer with fixed action set', async ({ page }) => {
  const created = await createCard(page, `drawer-${Date.now()}`, 1140, 260);
  await expect(created.locator('.pin-action-affordance')).toBeVisible();
  await expect(created.locator(':scope > .pin-hide')).toHaveCount(0);
  await expect(created.locator(':scope > .pin-delete')).toHaveCount(0);
  await expect(created.locator(':scope > .pin-complete')).toHaveCount(0);
  await expect(created.locator(':scope > .pin-touch')).toBeVisible();
  await expect(created.locator('.pin-edge--right')).toHaveCSS('cursor', 'default');

  await openActionDrawer(created);

  const drawer = created.locator('.pin-action-drawer');
  await expect(drawer.locator('button')).toHaveCount(3);
  await expect(drawer.locator('.pin-hide')).toHaveCount(1);
  await expect(drawer.locator('.pin-delete')).toHaveCount(1);
  await expect(drawer.locator('.pin-complete')).toHaveCount(1);
  await expect(drawer.locator('.pin-touch')).toHaveCount(0);
  await expect(created.locator('.pin-action-affordance')).toBeVisible();
  await expect(created.locator('.pin-drawer-dim')).not.toHaveCSS('opacity', '0');
  await expect(created.locator('.pin-slip')).toBeVisible();

  const affordanceBox = await created.locator('.pin-action-affordance').boundingBox();
  const drawerBox = await drawer.boundingBox();
  const touchBox = await created.locator('.pin-touch').boundingBox();
  const slipBox = await created.locator('.pin-slip').boundingBox();
  expect(affordanceBox).not.toBeNull();
  expect(drawerBox).not.toBeNull();
  expect(touchBox).not.toBeNull();
  expect(slipBox).not.toBeNull();
  expect(drawerBox!.x + drawerBox!.width).toBeLessThan(affordanceBox!.x);
  expect(affordanceBox!.width).toBeCloseTo(touchBox!.width, 1);
  expect(touchBox!.width).toBeCloseTo(slipBox!.width, 1);
  expect(affordanceBox!.height).toBeCloseTo(touchBox!.height, 1);
  expect(touchBox!.height).toBeCloseTo(slipBox!.height, 1);
  expect(affordanceBox!.y).toBeLessThan(touchBox!.y);
  expect(touchBox!.y).toBeLessThan(slipBox!.y);
  const affordanceCenterY = affordanceBox!.y + affordanceBox!.height / 2;
  const touchCenterY = touchBox!.y + touchBox!.height / 2;
  const slipCenterY = slipBox!.y + slipBox!.height / 2;
  expect(touchCenterY).toBeCloseTo((affordanceCenterY + slipCenterY) / 2, 1);
});

test('touch control stays explicit, toggles today state, and supports undo', async ({ page }) => {
  const created = await createCard(page, `touch-${Date.now()}`, 1120, 260);

  const touchButton = created.locator('.pin-touch');
  await expect(touchButton).toBeVisible();
  await expect(created.locator('.pin-action-drawer .pin-touch')).toHaveCount(0);
  await expect(created).toHaveAttribute('data-touched-today', 'false');
  await expect(created).toHaveAttribute('data-active', 'true');
  await expect(created).toHaveAttribute('data-stale', 'false');
  await expect(created).toHaveAttribute('data-touch-count7d', '0');
  await expect(created).toHaveAttribute('data-last-touched-day', '');

  await touchButton.click();
  await expect(created).toHaveAttribute('data-touched-today', 'true');
  await expect(created).toHaveAttribute('data-active', 'true');
  await expect(created).toHaveAttribute('data-stale', 'false');
  await expect(created).toHaveAttribute('data-touch-count7d', '1');
  await expect(created).toHaveAttribute('data-last-touched-day', /\d{4}-\d{2}-\d{2}/);
  await expect(page.locator('.undo-toast')).toContainText('Touched');

  await page.locator('.undo-btn').click();
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(created).toHaveAttribute('data-touched-today', 'false');
  await expect(created).toHaveAttribute('data-active', 'true');
  await expect(created).toHaveAttribute('data-stale', 'false');
  await expect(created).toHaveAttribute('data-touch-count7d', '0');
  await expect(created).toHaveAttribute('data-last-touched-day', '');
});

test('stale emphasis remains visible for stale cards and stays off active cards', async ({ page }) => {
  const staleSeed = page.locator('.pin').first();
  const staleSeedId = await staleSeed.getAttribute('data-id');
  expect(staleSeedId).toBeTruthy();

  ageCardInDb(staleSeedId!, 10);
  await page.reload();

  const staleCard = page.locator(`.pin[data-id="${staleSeedId}"]`);
  await expect(staleCard).toHaveAttribute('data-stale', 'true');

  const activeCard = await createCard(page, `active-${Date.now()}`, 860, 260);
  await expect(activeCard).toHaveAttribute('data-stale', 'false');

  const staleNormal = await pinChrome(staleCard);
  const activeNormal = await pinChrome(activeCard);

  expect(staleNormal.borderColor).not.toBe(activeNormal.borderColor);
  expect(staleNormal.boxShadow).not.toBe(activeNormal.boxShadow);

  await staleCard.click({ position: { x: 30, y: 20 } });
  await expect(staleCard).toHaveClass(/selected/);
  const staleSelected = await pinChrome(staleCard);

  expect(staleSelected.borderColor).not.toBe(activeNormal.borderColor);
  expect(staleSelected.boxShadow).not.toBe(activeNormal.boxShadow);

  await dragBy(page, staleCard, 48, 18);
  const staleDragged = await pinChrome(staleCard);

  expect(staleDragged.borderColor).not.toBe(activeNormal.borderColor);
  expect(staleDragged.boxShadow).not.toBe(activeNormal.boxShadow);
});

test('complete shows acknowledgment, supports undo, and expires after 6s', async ({ page }) => {
  const title = `complete-${Date.now()}`;
  const created = await createCard(page, title, 1180, 240);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  await openActionDrawer(created);
  const completeButton = created.locator('.pin-action-drawer .pin-complete');
  await expect(completeButton).toHaveText('✓');
  await expect(completeButton).toHaveAttribute('aria-label', 'Complete card');
  await expect(created.locator('.pin-slip')).toBeVisible();
  await completeButton.click();

  const samePin = page.locator(`.pin[data-id="${id}"]`);
  await expect(samePin).toHaveAttribute('data-state', 'completed');
  await expect(samePin.locator('.pin-complete-smile')).toHaveCount(1);
  await expect(page.locator('.undo-toast')).toContainText('Completed');
  await page.waitForTimeout(1500);
  await expect(page.locator('.undo-toast')).toContainText('Completed');
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);

  await page.locator('.undo-btn').click();
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveAttribute('data-state', 'active');

  await openActionDrawer(samePin);
  await samePin.locator('.pin-action-drawer .pin-complete').click();
  await expect(page.locator('.undo-toast')).toContainText('Completed');
  await page.waitForTimeout(6200);

  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
});

test('delete in focus uses undo without confirmation modal', async ({ page }) => {
  const title = `delete-${Date.now()}`;
  const created = await createCard(page, title, 1160, 320);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-delete').click();

  await expect(page.locator('.context-confirm')).toBeHidden();
  await expect(page.locator('.undo-toast')).toContainText('Deleted');
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);

  await page.locator('.undo-btn').click();
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
});

test('context delete requires confirmation and cancel keeps context', async ({ page }) => {
  await page.goto('/?canvas=contexts');
  await expect(page.locator('#surface')).toBeVisible();

  const pin = await createContext(page, `ctx-delete-${Date.now()}`);
  const id = await pin.getAttribute('data-id');
  expect(id).toBeTruthy();
  const contextsPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/contexts')) {
      contextsPosts.push(request.url());
    }
  });

  await pin.hover();
  await pin.locator('.pin-delete').click({ force: true });
  await expect(page.locator('.context-confirm')).toBeVisible();

  await page.locator('#context-confirm-cancel').click();
  await expect(page.locator('.context-confirm')).toBeHidden();
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
  expect(contextsPosts).toHaveLength(0);

  const samePin = page.locator(`.pin[data-id="${id}"]`);
  await samePin.hover();
  await samePin.locator('.pin-delete').click({ force: true });
  await expect(page.locator('.context-confirm')).toBeVisible();
  await page.locator('#context-confirm-delete').click();

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  expect(contextsPosts).toHaveLength(0);
});

test('blank context cards are discarded when left empty', async ({ page }) => {
  await page.goto('/?canvas=contexts');
  await expect(page.locator('#surface')).toBeVisible();

  const pins = page.locator('.pin');
  const before = await pins.count();

  await page.locator('#surface').click({ position: { x: 1080, y: 640 } });
  await expect(pins).toHaveCount(before + 1);

  const blankPin = pins.nth(before);
  const titleInput = blankPin.locator('.pin-title input');
  await expect(titleInput).toBeFocused();
  await expect(titleInput).toHaveValue('');

  await titleInput.evaluate((el) => (el as HTMLInputElement).blur());
  await expect(pins).toHaveCount(before);
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
