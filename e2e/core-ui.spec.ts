import { expect, test, type Page, type Locator } from '@playwright/test';

async function createCard(page: Page, title: string, x = 1050, y = 620): Promise<Locator> {
  const pins = page.locator('.pin');
  const before = await pins.count();

  await page.locator('#surface').click({ position: { x, y } });
  await expect(pins).toHaveCount(before + 1);

  const pin = pins.nth(before);
  const titleInput = pin.locator('.pin-title input');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await titleInput.blur();
  await page.waitForTimeout(350);
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
