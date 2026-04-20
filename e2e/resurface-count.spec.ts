import { expect, test, type Locator, type Page } from '@playwright/test';

async function createCard(page: Page, title: string, x = 1080, y = 260): Promise<Locator> {
  const pins = page.locator('.pin');
  const before = await pins.count();
  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(surfaceBox).not.toBeNull();
  await page.mouse.click(surfaceBox!.x + x, surfaceBox!.y + y);
  await expect(pins).toHaveCount(before + 1);
  const pin = pins.nth(before);
  const titleInput = pin.locator('.pin-title input');
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await titleInput.blur();
  await page.waitForTimeout(320);
  return pin;
}

function parseHiddenToken(text: string): { hiddenTotal: number; resurfacedCount: number } {
  const match = text.trim().match(/^Hidden\s+(\d+)\s+·\s+(\d+)↑$/);
  if (!match) {
    throw new Error(`hidden token mismatch: ${text}`);
  }
  return {
    hiddenTotal: Number(match[1]),
    resurfacedCount: Number(match[2]),
  };
}

async function readHiddenCounts(page: Page): Promise<{ hiddenTotal: number; resurfacedCount: number }> {
  const hiddenToggle = page.locator('#hidden-toggle');
  await expect(hiddenToggle).toBeVisible();
  const text = (await hiddenToggle.textContent()) || '';
  return parseHiddenToken(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#surface')).toBeVisible();
});

test('hidden control shows dual-count token and exact tooltip semantics', async ({ page }) => {
  const hiddenToggle = page.locator('#hidden-toggle');
  await expect(hiddenToggle).toBeVisible();

  const text = (await hiddenToggle.textContent()) || '';
  const { hiddenTotal, resurfacedCount } = parseHiddenToken(text);
  expect(resurfacedCount).toBeGreaterThanOrEqual(0);
  expect(resurfacedCount).toBeLessThanOrEqual(hiddenTotal);

  await hiddenToggle.hover();
  await expect(hiddenToggle).toHaveAttribute('title', `Hidden ${hiddenTotal}, resurfaced ${resurfacedCount}`);
});

test('hidden and resurfaced counts recompute across hide and hidden-to-canvas move transitions', async ({ page }) => {
  const before = await readHiddenCounts(page);
  const title = `resurface-count-hide-${Date.now()}`;
  const created = await createCard(page, title);

  await created.locator('.pin-action-host').hover();
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Enter');
  await expect(created).toHaveCount(0);

  await expect.poll(() => readHiddenCounts(page)).toEqual({
    hiddenTotal: before.hiddenTotal + 1,
    resurfacedCount: before.resurfacedCount,
  });

  await page.locator('#hidden-toggle').click();
  const moved = page.locator('.hidden-tray-item', { hasText: title }).first();
  await expect(moved).toBeVisible();
  await moved.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

  await expect.poll(() => readHiddenCounts(page)).toEqual(before);
});

test('due-time count updates on next foreground recompute trigger (not timer-driven)', async ({ page }) => {
  const before = await readHiddenCounts(page);
  const created = await createCard(page, `resurface-count-due-${Date.now()}`, 1120, 260);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  const hideResponse = await page.evaluate(async ({ cardID }) => {
    const snoozeUntil = new Date(Date.now() + 1200).toISOString();
    const response = await fetch('/api/items/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardID, contextId: 'main-orbit', snoozeUntil }),
    });
    return { ok: response.ok, status: response.status };
  }, { cardID: id });
  expect(hideResponse.ok).toBeTruthy();

  await page.reload();
  await expect(page.locator('#surface')).toBeVisible();

  await expect.poll(() => readHiddenCounts(page)).toEqual({
    hiddenTotal: before.hiddenTotal + 1,
    resurfacedCount: before.resurfacedCount,
  });

  await page.waitForTimeout(1800);
  const afterDueNoTrigger = await readHiddenCounts(page);
  expect(afterDueNoTrigger).toEqual({
    hiddenTotal: before.hiddenTotal + 1,
    resurfacedCount: before.resurfacedCount,
  });

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await expect.poll(() => readHiddenCounts(page)).toEqual({
    hiddenTotal: before.hiddenTotal + 1,
    resurfacedCount: before.resurfacedCount + 1,
  });
});
