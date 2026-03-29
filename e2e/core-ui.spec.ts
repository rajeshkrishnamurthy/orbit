import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page, type Locator, type ConsoleMessage } from '@playwright/test';

async function createCard(page: Page, title: string, x = 1050, y = 620): Promise<Locator> {
  const pins = page.locator('.pin');
  const before = await pins.count();
  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(surfaceBox).not.toBeNull();
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
    await page.mouse.click(surfaceBox!.x + p.x, surfaceBox!.y + p.y);
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
  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(surfaceBox).not.toBeNull();
  const positions = [
    { x, y },
    { x: 1120, y: 640 },
    { x: 240, y: 640 },
    { x: 1120, y: 140 },
    { x: 240, y: 140 },
  ];
  let added = false;
  for (const p of positions) {
    await page.mouse.click(surfaceBox!.x + p.x, surfaceBox!.y + p.y);
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
  const filtersPanel = page.locator('#filters-panel');
  await expect(filtersPanel).toBeVisible();
  await page.locator('.lens-slider').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(180);
}

async function setPageZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
    window.dispatchEvent(new Event('resize'));
  }, zoom);
  await page.waitForTimeout(160);
}

async function getHiddenCount(page: Page): Promise<number> {
  const hiddenToggle = page.locator('#hidden-toggle');
  if ((await hiddenToggle.count()) > 0) {
    const count = await hiddenToggle.evaluate((el) => {
      const text = (el.textContent || '').trim();
      const labelMatch = text.match(/\((\d+)\)\s*$/);
      if (labelMatch) return Number(labelMatch[1]);
      const datasetCount = Number((el as HTMLButtonElement).dataset.hiddenCount || '');
      if (Number.isFinite(datasetCount)) return datasetCount;
      return (el as HTMLButtonElement).hidden ? 0 : Number.NaN;
    });
    if (Number.isFinite(count)) return count;
  }

  return 0;
}

async function ensureFiltersTrayOpen(page: Page): Promise<void> {
  const panel = page.locator('#filters-panel');
  await expect(panel).toBeVisible();
}

async function ensureHiddenTrayOpen(page: Page): Promise<void> {
  const hiddenToggle = page.locator('#hidden-toggle');
  await expect(hiddenToggle).toBeVisible();
  const hiddenTray = page.locator('.hidden-tray');
  if (!(await hiddenTray.isVisible())) {
    await hiddenToggle.click();
  }
  await expect(hiddenTray).toBeVisible();
}

async function expectSingleRowControls(hiddenToggle: Locator, lensToggle: Locator): Promise<void> {
  await expect(hiddenToggle).toBeVisible();
  await expect(lensToggle).toBeVisible();

  const hiddenBox = await hiddenToggle.boundingBox();
  const lensBox = await lensToggle.boundingBox();
  expect(hiddenBox).not.toBeNull();
  expect(lensBox).not.toBeNull();

  const hiddenTop = hiddenBox!.y;
  const hiddenBottom = hiddenBox!.y + hiddenBox!.height;
  const lensTop = lensBox!.y;
  const lensBottom = lensBox!.y + lensBox!.height;
  const overlap = Math.max(0, Math.min(hiddenBottom, lensBottom) - Math.max(hiddenTop, lensTop));
  const minHeight = Math.min(hiddenBox!.height, lensBox!.height);

  expect(overlap / minHeight).toBeGreaterThanOrEqual(0.7);
  expect(lensBox!.x).toBeGreaterThanOrEqual(hiddenBox!.x + hiddenBox!.width - 2);
}

async function openActionDrawer(pin: Locator): Promise<void> {
  const host = pin.locator('.pin-action-host');
  await expect(host).toBeVisible();
  await host.hover();
  await expect(pin.locator('.pin-action-drawer')).toBeVisible();
}

async function openActivityLogPopover(page: Page, pin: Locator): Promise<Locator> {
  await openActionDrawer(pin);
  const activityAction = pin.locator('.pin-action-drawer .pin-activity');
  await expect(activityAction).toBeVisible();
  await activityAction.click();
  const popover = page.locator('.activity-log-popover');
  await expect(popover).toBeVisible();
  return popover;
}

async function confirmHideChooserWithKey(page: Page, key: 'Enter' | 'Escape' = 'Escape'): Promise<void> {
  const chooser = page.locator('.hide-snooze-chooser');
  await expect(chooser).toBeVisible();
  await page.keyboard.press(key);
  await expect(chooser).toBeHidden();
}

async function getCanvasViewportRect(page: Page): Promise<{ left: number; top: number; right: number; bottom: number; width: number; height: number } | null> {
  return page.evaluate(() => (window as unknown as { canvasViewportRect?: { left: number; top: number; right: number; bottom: number; width: number; height: number } }).canvasViewportRect || null);
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

function activityLogCountInDb(itemID: string): number {
  const sql = `SELECT COUNT(*) FROM item_activity_logs WHERE item_id=${sqlLiteral(itemID)};`;
  const out = execFileSync('sqlite3', [sqliteDbPath(), sql], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  const count = Number(out);
  return Number.isFinite(count) ? count : Number.NaN;
}

function collectMutationFailureLogs(page: Page): { logs: string[]; stop: () => void } {
  const logs: string[] = [];
  const onConsole = (msg: ConsoleMessage): void => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!text.includes('[mutation-failure]')) return;
    logs.push(text);
  };
  page.on('console', onConsole);
  return {
    logs,
    stop: () => page.off('console', onConsole),
  };
}

function hasMutationLog(logs: string[], operation: string, endpoint: string): boolean {
  return logs.some((line) => line.includes(`"operation":"${operation}"`) && line.includes(`"endpoint":"${endpoint}"`));
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

test('top-left chrome keeps the primary row visible and filters controls open by default', async ({ page }) => {
  await expect(page.locator('.app-title')).toBeVisible();
  await expect(page.locator('.sub')).toHaveCount(0);
  await expect(page.locator('.context-head')).toBeVisible();
  await expect(page.locator('#toolbar')).toBeVisible();
  await expect(page.locator('.toolbar__label')).toHaveText('Card color');
  await expect(page.locator('.sw')).toHaveCount(5);
  await expect(page.locator('#filters-toggle')).toHaveCount(0);

  const filtersPanel = page.locator('#filters-panel');
  const filtersControls = filtersPanel.locator('.filters-tray__controls');
  await expect(filtersPanel).toBeVisible();
  await expect(filtersControls).toBeVisible();
  await expect(filtersPanel.locator('.lens-toggle')).toBeVisible();
  await expect(filtersPanel.locator('.lens-btn[data-lens="all"]')).toBeVisible();
  await expect(filtersPanel.locator('.lens-btn[data-lens="center"]')).toBeVisible();
  await expect(filtersPanel.locator('.lens-btn[data-lens="periphery"]')).toBeVisible();
  await expect(filtersPanel.locator('.lens-btn[data-lens="stale"]')).toBeVisible();

  const hiddenToggle = filtersPanel.locator('#hidden-toggle');
  const initialHiddenCount = await getHiddenCount(page);
  if (initialHiddenCount > 0) {
    await expect(hiddenToggle).toBeVisible();
  } else {
    await expect(hiddenToggle).toBeHidden();
  }
  const hideProbe = await createCard(page, `hidden-probe-${Date.now()}`, 1180, 680);
  await openActionDrawer(hideProbe);
  await hideProbe.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => getHiddenCount(page)).toBeGreaterThan(initialHiddenCount);
  await expect(hiddenToggle).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  const stripBox = await page.locator('#system-strip').boundingBox();
  const surfaceBox = await page.locator('#surface').boundingBox();
  const appTitleBox = await page.locator('.app-title').boundingBox();
  const colorsBox = await page.locator('.toolbar__colors').boundingBox();
  const contextBox = await page.locator('.context-head').boundingBox();
  const filtersControlsBox = await filtersControls.boundingBox();
  const toolbarBox = await page.locator('#toolbar').boundingBox();
  expect(stripBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  expect(appTitleBox).not.toBeNull();
  expect(colorsBox).not.toBeNull();
  expect(contextBox).not.toBeNull();
  expect(filtersControlsBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  const titleTop = appTitleBox!.y;
  const titleBottom = appTitleBox!.y + appTitleBox!.height;
  const colorsTop = colorsBox!.y;
  const colorsBottom = colorsBox!.y + colorsBox!.height;
  const titleColorsOverlap = Math.max(0, Math.min(titleBottom, colorsBottom) - Math.max(titleTop, colorsTop));
  const contextTop = contextBox!.y;
  const contextBottom = contextBox!.y + contextBox!.height;
  const filtersTop = filtersControlsBox!.y;
  const filtersBottom = filtersControlsBox!.y + filtersControlsBox!.height;
  const verticalOverlap = Math.max(0, Math.min(contextBottom, filtersBottom) - Math.max(contextTop, filtersTop));
  const stripToSurfaceGap = surfaceBox!.y - (stripBox!.y + stripBox!.height);
  expect(titleColorsOverlap / Math.min(appTitleBox!.height, colorsBox!.height)).toBeGreaterThanOrEqual(0.6);
  expect(colorsBox!.x).toBeGreaterThanOrEqual(appTitleBox!.x + appTitleBox!.width - 2);
  expect(verticalOverlap / Math.min(contextBox!.height, filtersControlsBox!.height)).toBeGreaterThanOrEqual(0.6);
  expect(filtersControlsBox!.x).toBeGreaterThanOrEqual(contextBox!.x + contextBox!.width - 2);
  expect(contextBox!.y + contextBox!.height).toBeLessThanOrEqual(surfaceBox!.y - 8);
  expect(stripToSurfaceGap).toBeGreaterThanOrEqual(0);
  expect(stripToSurfaceGap).toBeLessThanOrEqual(24);
});

test('top-left chrome separates colors box and filters box in stacked layout', async ({ page }) => {
  // Arrange: both control groups are visible in top-left chrome.
  const cardColorLabel = page.locator('.toolbar__label', { hasText: 'Card color' });
  const swatchRail = page.locator('.toolbar__swatches');
  const filtersPanel = page.locator('#filters-panel');
  await expect(cardColorLabel).toBeVisible();
  await expect(swatchRail).toBeVisible();
  await expect(filtersPanel).toBeVisible();

  // Act: capture container relationship and geometry for colors vs filters boxes.
  const relation = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('.toolbar__label')).find(
      (el) => (el.textContent || '').trim() === 'Card color',
    );
    const swatches = document.querySelector('.toolbar__swatches');
    const filters = document.querySelector('#filters-panel');
    if (!label || !swatches || !filters) return null;

    const labelAncestors: Element[] = [];
    let cursor: Element | null = label.parentElement;
    while (cursor) {
      labelAncestors.push(cursor);
      cursor = cursor.parentElement;
    }

    let colorsBox: Element | null = swatches;
    while (colorsBox && !labelAncestors.includes(colorsBox)) {
      colorsBox = colorsBox.parentElement;
    }
    if (!colorsBox) return null;

    const colorsRect = colorsBox.getBoundingClientRect();
    const filtersRect = filters.getBoundingClientRect();
    const horizontalOverlap = Math.max(
      0,
      Math.min(colorsRect.right, filtersRect.right) - Math.max(colorsRect.left, filtersRect.left),
    );

    return {
      filtersInsideColors: colorsBox.contains(filters),
      colorsInsideFilters: filters.contains(colorsBox),
      colorsBottom: colorsRect.bottom,
      filtersTop: filtersRect.top,
      horizontalOverlap,
    };
  });
  expect(relation).not.toBeNull();

  // Assert: filters controls use a separate visual box and stack below colors controls.
  expect(relation!.filtersInsideColors).toBeFalsy();
  expect(relation!.colorsInsideFilters).toBeFalsy();
  expect(relation!.filtersTop).toBeGreaterThanOrEqual(relation!.colorsBottom - 1);
  expect(relation!.horizontalOverlap).toBeGreaterThan(0);
});

test('context title aligns with filters row and canvas starts immediately below', async ({ page }) => {
  // Arrange: verify the contract under constrained desktop width.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  // Arrange: required chrome elements for the row-level layout contract.
  const contextHead = page.locator('.context-head');
  const filtersControls = page.locator('#filters-panel .filters-tray__controls');
  const surface = page.locator('#surface');
  await expect(contextHead).toBeVisible();
  await expect(filtersControls).toBeVisible();
  await expect(surface).toBeVisible();

  // Act: capture geometry once to avoid race-y assertions.
  const contextBox = await contextHead.boundingBox();
  const filtersBox = await filtersControls.boundingBox();
  const surfaceBox = await surface.boundingBox();
  expect(contextBox).not.toBeNull();
  expect(filtersBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();

  const contextTop = contextBox!.y;
  const contextBottom = contextBox!.y + contextBox!.height;
  const filtersTop = filtersBox!.y;
  const filtersBottom = filtersBox!.y + filtersBox!.height;
  const verticalOverlap = Math.max(0, Math.min(contextBottom, filtersBottom) - Math.max(contextTop, filtersTop));
  const minControlHeight = Math.min(contextBox!.height, filtersBox!.height);
  const heightRatio = contextBox!.height / filtersBox!.height;
  const rowBottom = Math.max(contextBottom, filtersBottom);
  const rowHeight = rowBottom - Math.min(contextTop, filtersTop);
  const canvasGap = surfaceBox!.y - rowBottom;

  // Assert: same-row intent without pixel-perfect coupling.
  expect(verticalOverlap / minControlHeight).toBeGreaterThanOrEqual(0.6);
  expect(heightRatio).toBeGreaterThanOrEqual(0.6);
  expect(heightRatio).toBeLessThanOrEqual(2.2);
  expect(filtersBox!.x).toBeGreaterThanOrEqual(contextBox!.x + contextBox!.width - 2);

  // Assert: canvas starts directly under that row with only tight spacing.
  expect(canvasGap).toBeGreaterThanOrEqual(0);
  expect(canvasGap).toBeLessThanOrEqual(Math.max(24, rowHeight * 0.6));
});

test('layout shell exposes canvasViewportRect and keeps system chrome outside the canvas', async ({ page }) => {
  const canvasRect = await getCanvasViewportRect(page);
  expect(canvasRect).not.toBeNull();
  expect(canvasRect!.width).toBeGreaterThan(0);
  expect(canvasRect!.height).toBeGreaterThan(0);

  await expect(page.locator('[data-region="system strip"]')).toBeVisible();
  await expect(page.locator('[data-region="canvas"]')).toBeVisible();
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();

  const stripBox = await page.locator('#system-strip').boundingBox();
  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(stripBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  const stripToSurfaceGap = surfaceBox!.y - (stripBox!.y + stripBox!.height);
  expect(stripToSurfaceGap).toBeGreaterThanOrEqual(0);
  expect(stripToSurfaceGap).toBeLessThanOrEqual(24);

  for (const selector of ['.app-title', '.system-strip__controls', '.context-head', '#toolbar', '#filters-panel', '.system-ack-stack']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(canvasRect!.top);
  }

  const created = await createCard(page, `boundary-${Date.now()}`, 1080, 620);
  await dragBy(page, created, -120, -90);
  await page.reload();
  await expect(page.locator(`.pin[data-id="${await created.getAttribute('data-id')}"]`)).toHaveCount(1);

  const acknowledged = await createCard(page, `ack-${Date.now()}`, 1140, 260);
  await openActionDrawer(acknowledged);
  await acknowledged.locator('.pin-action-drawer .pin-complete').click();

  const undoToast = page.locator('.undo-toast');
  await expect(undoToast).toBeVisible();
  const undoToastBox = await undoToast.boundingBox();
  const canvasRectAfterAck = await getCanvasViewportRect(page);
  expect(undoToastBox).not.toBeNull();
  expect(canvasRectAfterAck).not.toBeNull();
  expect(undoToastBox!.y + undoToastBox!.height).toBeLessThanOrEqual(canvasRectAfterAck!.top);
  await page.locator('.undo-btn').click();
});

test('chrome relocation keeps every system chrome outside canvasViewportRect across viewport/zoom matrix', async ({ page }) => {
  const initialViewport = page.viewportSize();
  const profiles = [
    { width: 1440, height: 900, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1024, height: 768, zoom: 1 },
    { width: 1440, height: 900, zoom: 1.25 },
  ];
  const selectors = ['.app-title', '.system-strip__controls', '.context-head', '#toolbar', '#filters-panel', '.system-ack-stack'];

  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto('/');
    await setPageZoom(page, profile.zoom);

    const canvasRect = await getCanvasViewportRect(page);
    expect(canvasRect).not.toBeNull();
    await expect(page.locator('[data-region="system strip"]')).toBeVisible();
    await expect(page.locator('[data-region="canvas"]')).toBeVisible();
    await expect(page.locator('#filters-panel')).toBeVisible();

    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(canvasRect!.top + 1);
    }

    const created = await createCard(page, `packet2-matrix-${profile.width}-${profile.zoom}-${Date.now()}`, 1080, 620);
    await dragBy(page, created, -110, -90);
    await page.goto('/');
    await expect(page.locator(`.pin[data-id="${await created.getAttribute('data-id')}"]`)).toHaveCount(1);
  }

  if (initialViewport) {
    await page.setViewportSize(initialViewport);
  }
  await setPageZoom(page, 1);
});

test('strip pressure degrades the acknowledgment while Context/Hidden/Lens stay visible', async ({ page }) => {
  const initialViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await setPageZoom(page, 1);
  await page.reload();

  const created = await createCard(page, `packet2-ack-${Date.now()}`, 1140, 260);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-complete').click();

  const ack = page.locator('.system-ack.undo-toast');
  await expect(ack).toBeVisible();
  await expect(ack).toHaveAttribute('data-ack-mode', 'full');
  await expect(page.locator('.context-head')).toBeVisible();
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();
  await ensureFiltersTrayOpen(page);
  await expect(page.locator('#hidden-toggle')).toBeVisible();
  await expect(page.locator('.lens-toggle')).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await setPageZoom(page, 1);
  await page.waitForTimeout(220);
  await expect(ack).toHaveAttribute('data-ack-mode', 'compact');
  await expect(page.locator('.context-head')).toBeVisible();
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();
  await expect(page.locator('#hidden-toggle')).toBeVisible();
  await expect(page.locator('.lens-toggle')).toBeVisible();

  await page.setViewportSize({ width: 720, height: 560 });
  await setPageZoom(page, 1);
  await page.waitForTimeout(220);
  await expect(ack).toHaveAttribute('data-ack-mode', 'hidden');
  await expect(page.locator('.context-head')).toBeVisible();
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();
  await expect(page.locator('#hidden-toggle')).toBeVisible();
  await expect(page.locator('.lens-toggle')).toBeVisible();

  if (initialViewport) {
    await page.setViewportSize(initialViewport);
  }
  await setPageZoom(page, 1);
});

test('center/periphery lens updates membership when slider cutoff changes', async ({ page }) => {
  const total = await page.locator('.pin').count();
  expect(total).toBeGreaterThan(1);

  await ensureFiltersTrayOpen(page);
  await page.locator('.lens-btn[data-lens="center"]').click();
  await setLensSlider(page, 85);
  const center85 = await visiblePinIds(page);
  const slider = page.locator('.lens-slider');
  await expect(slider).toHaveValue('85');

  await setLensSlider(page, 35);
  const center35 = await visiblePinIds(page);
  await expect(slider).toHaveValue('35');

  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await setLensSlider(page, 85);
  const periphery85 = await visiblePinIds(page);

  const normalize = (ids: string[]) => [...new Set(ids)].sort().join(',');
  expect(center85.length).toBeGreaterThan(0);
  expect(center85.length).toBeLessThan(total);
  expect(periphery85.length).toBeGreaterThan(0);
  expect(periphery85.length).toBeLessThan(total);
  expect(center35.length).toBeLessThan(center85.length);
  expect(normalize(center35)).not.toEqual(normalize(center85));
});

test('canonical center semantics match pin classification and default lens visibility', async ({ page }) => {
  await ensureFiltersTrayOpen(page);

  const expected = await page.$$eval('.pin', (nodes) => {
    const semantics = (window as Window & {
      __CENTER_SEMANTICS__?: {
        desktopWidth?: number;
        desktopHeight?: number;
        centerX?: number;
        centerY?: number;
        radiusScale?: number;
        maxRadius?: number;
        lensRatio?: number;
      };
    }).__CENTER_SEMANTICS__;
    if (!semantics) {
      throw new Error('missing __CENTER_SEMANTICS__ bootstrap');
    }
    const surface = document.getElementById('surface') as HTMLElement;
    if (!surface) {
      throw new Error('missing #surface');
    }
    const liveWidth = surface.clientWidth;
    const liveHeight = surface.clientHeight;
    const width = Number(semantics.desktopWidth);
    const height = Number(semantics.desktopHeight);
    const radiusScale = Number(semantics.radiusScale);
    const centerX = Number(semantics.centerX);
    const centerY = Number(semantics.centerY);
    const maxRadius = Number(semantics.maxRadius);
    const lensRatio = Number(semantics.lensRatio);
    const baseWidth = Number.isFinite(width) && width > 0 ? width : liveWidth;
    const baseHeight = Number.isFinite(height) && height > 0 ? height : liveHeight;
    const scaleX = liveWidth / baseWidth;
    const scaleY = liveHeight / baseHeight;
    const geometryScale = Math.min(scaleX, scaleY);
    const cx = (Number.isFinite(centerX) ? centerX : (baseWidth / 2)) * scaleX;
    const cy = (Number.isFinite(centerY) ? centerY : (baseHeight / 2)) * scaleY;
    const baseRadius = Number.isFinite(maxRadius)
      ? maxRadius
      : (Math.min(baseWidth, baseHeight) * (Number.isFinite(radiusScale) ? radiusScale : 0.42));
    const cutoff = baseRadius * geometryScale * lensRatio;
    return nodes.map((node) => {
      const el = node as HTMLElement;
      const x = parseFloat(el.style.left || '0') + ((el.offsetWidth || 180) / 2);
      const y = parseFloat(el.style.top || '0') + ((el.offsetHeight || 72) / 2);
      const inCenter = Math.hypot(x - cx, y - cy) <= cutoff;
      return {
        id: el.dataset.id || '',
        attr: el.dataset.inCenter === 'true',
        inCenter,
      };
    });
  });

  expect(expected.length).toBeGreaterThan(1);
  expect(expected.every((item) => item.id)).toBeTruthy();
  expect(expected.every((item) => item.attr === item.inCenter)).toBeTruthy();

  await page.locator('.lens-btn[data-lens="center"]').click();
  await setLensSlider(page, 68);
  const centerVisible = [...(await visiblePinIds(page))].sort();
  const expectedCenter = expected.filter((item) => item.inCenter).map((item) => item.id).sort();
  expect(centerVisible).toEqual(expectedCenter);

  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await setLensSlider(page, 68);
  const peripheryVisible = [...(await visiblePinIds(page))].sort();
  const expectedPeriphery = expected.filter((item) => !item.inCenter).map((item) => item.id).sort();
  expect(peripheryVisible).toEqual(expectedPeriphery);
});

test('center/periphery slider stays visible inline between Periphery and Stale', async ({ page }) => {
  await ensureFiltersTrayOpen(page);

  const slider = page.locator('.lens-slider');
  const sliderWrap = page.locator('.lens-slider-wrap');
  const periphery = page.locator('.lens-btn[data-lens="periphery"]');
  const stale = page.locator('.lens-btn[data-lens="stale"]');

  const assertInlineBetweenPeripheryAndStale = async (): Promise<void> => {
    await expect(sliderWrap).toBeVisible();
    await expect(slider).toBeVisible();

    const peripheryBox = await periphery.boundingBox();
    const staleBox = await stale.boundingBox();
    const sliderBox = await slider.boundingBox();
    expect(peripheryBox).not.toBeNull();
    expect(staleBox).not.toBeNull();
    expect(sliderBox).not.toBeNull();

    const sliderCenterY = sliderBox!.y + sliderBox!.height / 2;
    const peripheryCenterY = peripheryBox!.y + peripheryBox!.height / 2;
    const staleCenterY = staleBox!.y + staleBox!.height / 2;
    expect(Math.abs(peripheryCenterY - sliderCenterY)).toBeLessThanOrEqual(8);
    expect(Math.abs(staleCenterY - sliderCenterY)).toBeLessThanOrEqual(8);

    expect(sliderBox!.x).toBeGreaterThanOrEqual(peripheryBox!.x + peripheryBox!.width - 1);
    expect(sliderBox!.x + sliderBox!.width).toBeLessThanOrEqual(staleBox!.x + 1);
  };

  await page.locator('.lens-btn[data-lens="center"]').click();
  await expect(page.locator('.lens-btn[data-lens="center"]')).toHaveClass(/active/);
  await assertInlineBetweenPeripheryAndStale();

  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await expect(page.locator('.lens-btn[data-lens="periphery"]')).toHaveClass(/active/);
  await assertInlineBetweenPeripheryAndStale();
});

test('filters panel keeps Hidden and lens controls on one row', async ({ page }) => {
  // Arrange: ensure the Hidden toggle is rendered in the Filters panel.
  const card = await createCard(page, `filters-row-${Date.now()}`, 1120, 260);
  await ensureFiltersTrayOpen(page);
  await openActionDrawer(card);
  await card.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => getHiddenCount(page)).toBeGreaterThan(0);

  const hiddenToggle = page.locator('#hidden-toggle');
  const lensToggle = page.locator('.lens-toggle');
  const sliderWrap = page.locator('.lens-slider-wrap');

  // Act + Assert: lens=All (slider hidden) keeps Hidden + lens controls on one row.
  await page.locator('.lens-btn[data-lens="all"]').click();
  await expect(sliderWrap).toBeHidden();
  await expectSingleRowControls(hiddenToggle, lensToggle);

  // Act + Assert: lens=Center (slider visible) still keeps one row.
  await page.locator('.lens-btn[data-lens="center"]').click();
  await expect(sliderWrap).toBeVisible();
  await expectSingleRowControls(hiddenToggle, lensToggle);

  // Act + Assert: lens=Periphery (slider visible) still keeps one row.
  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await expect(sliderWrap).toBeVisible();
  await expectSingleRowControls(hiddenToggle, lensToggle);
});

test('filters panel width is content-tight when slider is hidden', async ({ page }) => {
  // Arrange: ensure Hidden toggle is present so row geometry is stable and comparable.
  const card = await createCard(page, `filters-width-${Date.now()}`, 1120, 260);
  await ensureFiltersTrayOpen(page);
  await openActionDrawer(card);
  await card.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => getHiddenCount(page)).toBeGreaterThan(0);

  const panel = page.locator('#filters-panel');
  const controlsRow = page.locator('.filters-tray__controls');
  const hiddenToggle = page.locator('#hidden-toggle');
  const lensToggle = page.locator('.lens-toggle');
  const sliderWrap = page.locator('.lens-slider-wrap');
  const slider = page.locator('.lens-slider');

  // Act: lens=All should hide slider and keep controls in a single row.
  await page.locator('.lens-btn[data-lens="all"]').click();
  await expect(sliderWrap).toBeHidden();
  await expectSingleRowControls(hiddenToggle, lensToggle);

  const allPanelBox = await panel.boundingBox();
  const allControlsBox = await controlsRow.boundingBox();
  expect(allPanelBox).not.toBeNull();
  expect(allControlsBox).not.toBeNull();

  // Assert: content-tight means panel width tracks controls width with only modest shell slack.
  const allSlackPx = allPanelBox!.width - allControlsBox!.width;
  const allSlackRatio = allPanelBox!.width / allControlsBox!.width;
  expect(allSlackPx).toBeLessThanOrEqual(56);
  expect(allSlackRatio).toBeLessThanOrEqual(1.2);

  // Act: lens=Center should show slider, stay one-row, and materially widen panel.
  await page.locator('.lens-btn[data-lens="center"]').click();
  await expect(sliderWrap).toBeVisible();
  await expectSingleRowControls(hiddenToggle, lensToggle);

  const centerPanelBox = await panel.boundingBox();
  const sliderBox = await slider.boundingBox();
  expect(centerPanelBox).not.toBeNull();
  expect(sliderBox).not.toBeNull();

  // Act: lens=Periphery should keep slider visible and preserve one-row layout.
  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await expect(sliderWrap).toBeVisible();
  await expectSingleRowControls(hiddenToggle, lensToggle);

  const peripheryPanelBox = await panel.boundingBox();
  expect(peripheryPanelBox).not.toBeNull();

  // Assert: slider-visible modes are wider than All by a meaningful geometric margin.
  const minWideningPx = Math.max(20, sliderBox!.width * 0.4);
  expect(centerPanelBox!.width - allPanelBox!.width).toBeGreaterThanOrEqual(minWideningPx);
  expect(peripheryPanelBox!.width - allPanelBox!.width).toBeGreaterThanOrEqual(minWideningPx);
});

test('filters tray is open by default and preserves active filter state after Escape', async ({ page }) => {
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();

  await page.locator('.lens-btn[data-lens="center"]').click();
  await setLensSlider(page, 35);

  const visibleBeforeEscape = await visiblePinIds(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#filters-panel')).toBeVisible();

  await expect(page.locator('.lens-btn[data-lens="center"]')).toHaveClass(/active/);
  await expect(page.locator('.lens-slider')).toHaveValue('35');

  const visibleAfterEscape = await visiblePinIds(page);
  expect(visibleAfterEscape.sort()).toEqual(visibleBeforeEscape.sort());
});

test('filters tray stays open on outside chrome clicks without losing active filter state', async ({ page }) => {
  await expect(page.locator('#filters-panel')).toBeVisible();
  await page.locator('.lens-btn[data-lens="center"]').click();
  await setLensSlider(page, 35);
  const visibleBeforeOutsideClick = await visiblePinIds(page);

  await page.locator('.context-head').click();
  await expect(page.locator('#filters-panel')).toBeVisible();

  await expect(page.locator('.lens-btn[data-lens="center"]')).toHaveClass(/active/);
  await expect(page.locator('.lens-slider')).toHaveValue('35');
  const visibleAfterOutsideClick = await visiblePinIds(page);
  expect(visibleAfterOutsideClick.sort()).toEqual(visibleBeforeOutsideClick.sort());
});

test('filters tray keeps card color swatches visible and clickable while open', async ({ page }) => {
  const pin = await createCard(page, `swatch-${Date.now()}`, 1180, 240);
  await pin.click();
  const before = (await pin.getAttribute('data-color')) ?? '';

  await ensureFiltersTrayOpen(page);
  const swatches = page.locator('.sw');
  await expect(swatches.first()).toBeVisible();
  const count = await swatches.count();
  let changed = false;
  for (let i = 0; i < count; i++) {
    await swatches.nth(i).click();
    await page.waitForTimeout(220);
    const after = (await pin.getAttribute('data-color')) ?? '';
    if (after !== before) {
      changed = true;
      break;
    }
  }

  await expect(page.locator('#filters-panel')).toBeVisible();
  expect(changed).toBeTruthy();
  await expect(pin).not.toHaveAttribute('data-color', before);
});

test('filters tray stays anchored without moving the canvas on constrained widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 420 });
  await setPageZoom(page, 1.25);
  await page.waitForTimeout(180);

  const surfaceBefore = await page.locator('#surface').boundingBox();
  const before = await getCanvasViewportRect(page);
  expect(surfaceBefore).not.toBeNull();
  expect(before).not.toBeNull();

  await ensureFiltersTrayOpen(page);
  const panel = page.locator('#filters-panel');
  const tray = page.locator('.filters-tray');

  const panelBox = await panel.boundingBox();
  const trayBox = await tray.boundingBox();
  const surfaceAfter = await page.locator('#surface').boundingBox();
  const after = await getCanvasViewportRect(page);

  expect(panelBox).not.toBeNull();
  expect(trayBox).not.toBeNull();
  expect(surfaceAfter).not.toBeNull();
  expect(after).not.toBeNull();
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(trayBox!.x + trayBox!.width + 1);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(surfaceAfter!.y);
  expect(surfaceAfter!.y).toBeCloseTo(surfaceBefore!.y, 1);
  expect(after!.top).toBeCloseTo(before!.top, 1);
});

test('filters tray refreshes canvasViewportRect before immediate card creation', async ({ page }) => {
  await expect(page.locator('#filters-toggle')).toHaveCount(0);
  await expect(page.locator('#filters-panel')).toBeVisible();

  const surfaceBefore = await page.locator('#surface').boundingBox();
  const before = await getCanvasViewportRect(page);
  expect(before).not.toBeNull();

  await page.locator('.lens-btn[data-lens="center"]').click();
  await expect(page.locator('.lens-slider-wrap')).toBeVisible();

  const surfaceAfter = await page.locator('#surface').boundingBox();
  const after = await getCanvasViewportRect(page);
  expect(after).not.toBeNull();
  expect(surfaceBefore).not.toBeNull();
  expect(surfaceAfter).not.toBeNull();
  const surfaceShift = Math.abs(surfaceAfter!.y - surfaceBefore!.y);
  expect(Math.abs(after!.top - before!.top)).toBeLessThanOrEqual(surfaceShift + 1);
  expect(after!.top).toBeCloseTo(surfaceAfter!.y, 1);

  const created = await createCard(page, `filters-boundary-${Date.now()}`, 1180, 680);
  const createdBox = await created.boundingBox();
  expect(createdBox).not.toBeNull();
  expect(createdBox!.y).toBeGreaterThan(surfaceAfter!.y);
  expect(createdBox!.y + createdBox!.height).toBeLessThanOrEqual(surfaceAfter!.y + surfaceAfter!.height);
});

test('hidden tray remains open during filters interactions and closes independently', async ({ page }) => {
  const title = `hidden-tray-realign-${Date.now()}`;
  const created = await createCard(page, title);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();
  const initialCount = await getHiddenCount(page);

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  await expect.poll(() => getHiddenCount(page)).toBe(initialCount + 1);

  const hiddenToggle = page.locator('#hidden-toggle');
  await hiddenToggle.click();

  const hiddenTray = page.locator('.hidden-tray');
  await expect(hiddenTray).toBeVisible();

  // Interacting with always-open Filters controls should not close Hidden tray.
  await page.locator('.lens-btn[data-lens="center"]').click();
  await expect(page.locator('#filters-panel')).toBeVisible();
  await expect(hiddenTray).toBeVisible();

  // Canvas click closes Hidden tray independently of Filters.
  await page.locator('#surface').click({ position: { x: 80, y: 80 } });
  await expect(hiddenTray).toBeHidden();

  // Further Filters interactions must not implicitly reopen Hidden tray.
  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await expect(page.locator('#filters-panel')).toBeVisible();
  await expect(hiddenTray).toBeHidden();
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

  await ensureFiltersTrayOpen(page);
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

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
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

test('hide chooser defaults to 3 days and Enter confirms selected option', async ({ page }) => {
  const created = await createCard(page, `hide-default-3d-${Date.now()}`);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  let hidePayload: Record<string, unknown> | null = null;
  await page.route('**/api/items/hide', async (route, request) => {
    if (!hidePayload && request.method() === 'POST') {
      hidePayload = JSON.parse(request.postData() || '{}');
    }
    await route.continue();
  });

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await expect(page.locator('.hide-snooze-chooser__option[data-selected="true"]')).toContainText('3 days');
  await confirmHideChooserWithKey(page, 'Enter');

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  await expect.poll(() => !!hidePayload).toBeTruthy();

  const snoozeUntilRaw = String(hidePayload?.snoozeUntil || '');
  expect(snoozeUntilRaw).toBeTruthy();
  const delta = Date.parse(snoozeUntilRaw) - Date.now();
  expect(delta).toBeGreaterThan(71 * 60 * 60 * 1000);
  expect(delta).toBeLessThan(73 * 60 * 60 * 1000);
});

test('hide chooser arrow keys move selection and Escape confirms current option', async ({ page }) => {
  const created = await createCard(page, `hide-escape-select-${Date.now()}`);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  let hidePayload: Record<string, unknown> | null = null;
  await page.route('**/api/items/hide', async (route, request) => {
    if (!hidePayload && request.method() === 'POST') {
      hidePayload = JSON.parse(request.postData() || '{}');
    }
    await route.continue();
  });

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.hide-snooze-chooser__option[data-selected="true"]')).toContainText('1 day');
  await confirmHideChooserWithKey(page, 'Escape');

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  await expect.poll(() => !!hidePayload).toBeTruthy();

  const snoozeUntilRaw = String(hidePayload?.snoozeUntil || '');
  expect(snoozeUntilRaw).toBeTruthy();
  const delta = Date.parse(snoozeUntilRaw) - Date.now();
  expect(delta).toBeGreaterThan(23 * 60 * 60 * 1000);
  expect(delta).toBeLessThan(25 * 60 * 60 * 1000);
});

test('hide chooser allows mouse selection of Skip snooze', async ({ page }) => {
  const created = await createCard(page, `hide-skip-${Date.now()}`);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  let hidePayload: Record<string, unknown> | null = null;
  await page.route('**/api/items/hide', async (route, request) => {
    if (!hidePayload && request.method() === 'POST') {
      hidePayload = JSON.parse(request.postData() || '{}');
    }
    await route.continue();
  });

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await expect(page.locator('.hide-snooze-chooser')).toBeVisible();
  await page.locator('.hide-snooze-chooser__option', { hasText: 'Skip snooze' }).click();

  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  await expect.poll(() => !!hidePayload).toBeTruthy();
  expect(hidePayload?.snoozeUntil).toBeUndefined();
});

test('hidden tray shows snooze days-left only for snoozed cards', async ({ page }) => {
  const snoozedTitle = `hidden-snoozed-${Date.now()}`;
  const skippedTitle = `hidden-skip-${Date.now()}`;
  const snoozedCard = await createCard(page, snoozedTitle);
  const skippedCard = await createCard(page, skippedTitle);
  const snoozedID = await snoozedCard.getAttribute('data-id');
  const skippedID = await skippedCard.getAttribute('data-id');
  expect(snoozedID).toBeTruthy();
  expect(skippedID).toBeTruthy();

  const hideResults = await page.evaluate(async ({ snoozedCardID, skippedCardID }) => {
    const snoozeUntil = new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString();
    const snoozedResponse = await fetch('/api/items/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: snoozedCardID, contextId: 'main-orbit', snoozeUntil }),
    });
    const skippedResponse = await fetch('/api/items/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: skippedCardID, contextId: 'main-orbit' }),
    });
    return {
      snoozedOk: snoozedResponse.ok,
      skippedOk: skippedResponse.ok,
    };
  }, { snoozedCardID: snoozedID, skippedCardID: skippedID });
  expect(hideResults.snoozedOk).toBeTruthy();
  expect(hideResults.skippedOk).toBeTruthy();

  await page.reload();
  await ensureHiddenTrayOpen(page);

  const snoozedHiddenItem = page.locator('.hidden-tray-item', { hasText: snoozedTitle }).first();
  await expect(snoozedHiddenItem).toBeVisible();
  await expect(snoozedHiddenItem.locator('.hidden-tray-item__snooze')).toHaveText('3d left');

  const skippedHiddenItem = page.locator('.hidden-tray-item', { hasText: skippedTitle }).first();
  await expect(skippedHiddenItem).toBeVisible();
  await expect(skippedHiddenItem.locator('.hidden-tray-item__snooze')).toHaveCount(0);
});

test('hide failure keeps card visible and shows warning', async ({ page }) => {
  const title = `hide-fail-${Date.now()}`;
  const created = await createCard(page, title);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();
  const initialCount = await getHiddenCount(page);
  let failedOnce = false;

  await page.route('**/api/items/hide', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.fulfill({ status: 500, body: 'hide failed' });
      return;
    }
    await route.continue();
  });

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');

  await expect(page.locator('.canvas-warning')).toContainText('Unable to hide card. Please try again.');
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
  await expect.poll(() => getHiddenCount(page)).toBe(initialCount);
  expect(failedOnce).toBeTruthy();

  const cleanup = await page.request.post('/api/items/delete', { data: { id } });
  expect(cleanup.ok()).toBeTruthy();
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

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(staleCard);
  await staleCard.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
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

test('resurface acknowledgment degrades under strip pressure', async ({ page }) => {
  const title = `resurface-${Date.now()}`;
  const created = await createCard(page, title, 1140, 260);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  ageCardInDb(id!, 8);
  await page.reload();

  const staleCard = page.locator(`.pin[data-id="${id}"]`);
  await expect(staleCard).toHaveAttribute('data-stale', 'true');
  const initialHiddenCount = await getHiddenCount(page);

  const resurfaceAtWidth = async (width: number, expectedMode: 'full' | 'compact' | 'hidden') => {
    await page.setViewportSize({ width, height: 800 });
    const canvasRect = await getCanvasViewportRect(page);
    expect(canvasRect).not.toBeNull();

    await ensureFiltersTrayOpen(page);
    await openActionDrawer(staleCard);
    await staleCard.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
    await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
    await expect.poll(() => getHiddenCount(page)).toBe(initialHiddenCount + 1);

    await ensureHiddenTrayOpen(page);
    const hiddenItem = page.locator('.hidden-tray-item', { hasText: title }).first();
    await expect.poll(async () => hiddenItem.count()).toBeGreaterThan(0);
    await expect(hiddenItem).toBeVisible();
    await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

    const ack = page.locator('.resurface-ack');
    if (expectedMode === 'hidden') {
      await expect(ack).toBeHidden();
    } else {
      await expect(ack).toBeVisible();
      const ackBox = await ack.boundingBox();
      expect(ackBox).not.toBeNull();
      expect(ackBox!.y + ackBox!.height).toBeLessThanOrEqual(canvasRect!.top + 1);
      await expect(ack).toHaveAttribute('data-ack-mode', expectedMode);
      await expect(ack).toContainText(expectedMode === 'full' ? 'Resurfaced' : '↺');
    }

    await expect.poll(() => getHiddenCount(page)).toBe(initialHiddenCount);
    await page.waitForTimeout(2600);
  };

  await resurfaceAtWidth(1440, 'full');
  await resurfaceAtWidth(1024, 'compact');
  await resurfaceAtWidth(700, 'hidden');
});

test('expired snoozed cards appear once in the resurface shelf for current context', async ({ page }) => {
  const title = `resurface-shelf-${Date.now()}`;
  const created = await createCard(page, title, 1080, 260);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  const hideResponse = await page.evaluate(async ({ cardID }) => {
    const snoozeUntil = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const response = await fetch('/api/items/hide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardID, contextId: 'main-orbit', snoozeUntil }),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  }, { cardID: id });
  expect(hideResponse.ok).toBeTruthy();

  await page.reload();

  const shelf = page.locator('#resurface-shelf');
  await expect(shelf).toBeVisible();
  const cardlets = shelf.locator('.resurface-shelf__cardlet', { hasText: title });
  await expect(cardlets).toHaveCount(1);

  const refreshResponse = await page.evaluate(async () => {
    const response = await fetch('/api/items/resurfaced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextId: 'main-orbit' }),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  });
  expect(refreshResponse.ok).toBeTruthy();
  await expect(cardlets).toHaveCount(1);
});

test('system events do not move existing user-positioned cards', async ({ page }) => {
  const anchor = await createCard(page, `packet4-anchor-${Date.now()}`, 920, 320);
  const anchorId = await anchor.getAttribute('data-id');
  expect(anchorId).toBeTruthy();

  const leftBefore = await anchor.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const topBefore = await anchor.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  await setPageZoom(page, 1.25);
  await ensureFiltersTrayOpen(page);
  await page.locator('.lens-btn[data-lens="center"]').click();
  await page.locator('.lens-btn[data-lens="periphery"]').click();
  await page.locator('#hidden-toggle').click();
  await page.locator('#hidden-toggle').click();

  const systemTitle = `packet4-system-${Date.now()}`;
  const systemCard = await createCard(page, systemTitle, 1140, 260);
  const systemCardId = await systemCard.getAttribute('data-id');
  expect(systemCardId).toBeTruthy();
  await openActionDrawer(systemCard);
  await systemCard.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect(page.locator(`.pin[data-id="${systemCardId}"]`)).toHaveCount(0);
  await page.locator('#hidden-toggle').click();
  const hiddenItem = page.locator('.hidden-tray-item', { hasText: systemTitle }).first();
  await expect(hiddenItem).toBeVisible();
  await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });
  await expect(page.locator('.resurface-ack')).toBeVisible();

  await setPageZoom(page, 1);

  const leftAfter = await anchor.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const topAfter = await anchor.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  expect(leftAfter).toBe(leftBefore);
  expect(topAfter).toBe(topBefore);
});

test('insertion policy is deterministic and never displaces existing cards', async ({ page }) => {
  const sentinelTitle = `packet4-sentinel-${Date.now()}`;
  const subjectTitle = `packet4-subject-${Date.now()}`;
  const sentinel = await createCard(page, sentinelTitle, 360, 300);
  const subject = await createCard(page, subjectTitle, 920, 320);
  const subjectId = await subject.getAttribute('data-id');
  expect(subjectId).toBeTruthy();

  const sentinelLeftBefore = await sentinel.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const sentinelTopBefore = await sentinel.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  const restoreOnce = async (): Promise<{ left: number; top: number }> => {
    const subjectCard = page.locator(`.pin[data-id="${subjectId}"]`);
    const hiddenCountBeforeHide = await getHiddenCount(page);
    await ensureFiltersTrayOpen(page);
    await openActionDrawer(subjectCard);
    await subjectCard.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
    await expect(subjectCard).toHaveCount(0);

    await expect.poll(() => getHiddenCount(page)).toBe(hiddenCountBeforeHide + 1);
    await page.locator('#hidden-toggle').click();
    const hiddenItem = page.locator('.hidden-tray-item', { hasText: subjectTitle }).first();
    await expect(hiddenItem).toBeVisible();
    await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

    const restored = page.locator(`.pin[data-id="${subjectId}"]`);
    await expect(restored).toHaveCount(1);
    await expect.poll(() => getHiddenCount(page)).toBe(hiddenCountBeforeHide);
    const left = await restored.evaluate((el) => parseFloat((el as HTMLElement).style.left));
    const top = await restored.evaluate((el) => parseFloat((el as HTMLElement).style.top));
    await page.locator('#hidden-toggle').click();
    return { left, top };
  };

  const first = await restoreOnce();
  const second = await restoreOnce();

  expect(second.left).toBe(first.left);
  expect(Math.abs(second.top - first.top)).toBeLessThanOrEqual(1);

  const sentinelLeftAfter = await sentinel.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const sentinelTopAfter = await sentinel.evaluate((el) => parseFloat((el as HTMLElement).style.top));

  expect(sentinelLeftAfter).toBe(sentinelLeftBefore);
  expect(sentinelTopAfter).toBe(sentinelTopBefore);
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
  await expect(drawer.locator('button')).toHaveCount(4);
  await expect(drawer.locator('.pin-activity')).toHaveCount(1);
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

test('activity log opens from overflow action with compact card-anchored popover', async ({ page }) => {
  const created = await createCard(page, `activity-open-${Date.now()}`, 1120, 260);
  await expect(created.locator(':scope > .pin-activity')).toHaveCount(0);
  const popover = await openActivityLogPopover(page, created);
  await expect(popover.locator('.activity-log-popover__header')).toHaveText('Activity log');
  await expect(popover.locator('.activity-log-popover__entries')).toBeVisible();
  await expect(popover.locator('.activity-log-popover__composer')).toBeVisible();
  await expect(popover.locator('.activity-log-popover__save')).toBeVisible();
});

test('activity log composer enforces trim-aware validation and 140-char limit', async ({ page }) => {
  const created = await createCard(page, `activity-validate-${Date.now()}`, 1120, 260);
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');
  const counter = popover.locator('.activity-log-popover__counter');
  const feedback = popover.locator('.activity-log-popover__feedback');

  await expect(counter).toHaveText('0/140');
  await expect(save).toBeDisabled();

  await composer.fill('   ');
  await expect(counter).toHaveText('3/140');
  await expect(save).toBeDisabled();

  await composer.fill('valid update');
  await expect(counter).toHaveText('12/140');
  await expect(save).toBeEnabled();

  await composer.fill('a'.repeat(140));
  await expect(counter).toHaveText('140/140');
  await expect(save).toBeEnabled();
  await expect(feedback).toBeHidden();

  await composer.fill('b'.repeat(141));
  await expect(counter).toHaveText('141/140');
  await expect(save).toBeDisabled();
  await expect(feedback).toContainText('140');
});

test('activity log save updates latest list and clears composer on success', async ({ page }) => {
  const created = await createCard(page, `activity-save-${Date.now()}`, 1120, 260);
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');
  const firstBody = popover.locator('.activity-log-popover__entry-body').first();
  const firstTime = popover.locator('.activity-log-popover__entry-time').first();

  await composer.fill('Client call completed');
  await save.click();
  await expect(firstBody).toContainText('Client call completed');
  await expect(firstTime).toHaveText(/\S+/);
  await expect(composer).toHaveValue('');
  await expect(popover.locator('.activity-log-popover__counter')).toHaveText('0/140');
  await expect(save).toBeDisabled();
});

test('activity log save failure keeps typed text for retry', async ({ page }) => {
  const created = await createCard(page, `activity-failure-${Date.now()}`, 1120, 260);
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');
  let failedOnce = false;

  await page.route('**/api/items/activity-log/add', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.fulfill({ status: 500, body: 'activity save failed' });
      return;
    }
    await route.continue();
  });

  const typed = `failed-save-${Date.now()}`;
  await composer.fill(typed);
  await save.click();
  await expect(page.locator('.canvas-warning')).toContainText('Unable to save activity log. Please try again.');
  await expect(composer).toHaveValue(typed);
  await expect(save).toBeEnabled();
  expect(failedOnce).toBeTruthy();
});

test('activity log popover surfaces only latest five entries in newest-first order', async ({ page }) => {
  const created = await createCard(page, `activity-cap-${Date.now()}`, 1120, 260);
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');

  for (let i = 1; i <= 6; i++) {
    await composer.fill(`activity ${i}`);
    await save.click();
    await expect(composer).toHaveValue('');
  }

  const bodies = popover.locator('.activity-log-popover__entry-body');
  await expect(bodies).toHaveCount(5);
  await expect(bodies.nth(0)).toHaveText('activity 6');
  await expect(bodies.nth(4)).toHaveText('activity 2');
  await expect(popover.locator('.activity-log-popover__entries')).not.toContainText('activity 1');
});

test('activity log empty state stays memory-bump focused and omits notes-style controls', async ({ page }) => {
  const created = await createCard(page, `activity-empty-${Date.now()}`, 1120, 260);
  await expect(created.locator(':scope > .pin-activity')).toHaveCount(0);
  const popover = await openActivityLogPopover(page, created);
  await expect(popover.locator('.activity-log-popover__empty')).toContainText('future-you');
  await expect(popover).not.toContainText(/edit/i);
  await expect(popover).not.toContainText(/search/i);
  await expect(popover).not.toContainText(/history/i);
});

test('activity log allows 140-char save with timestamp and persists after popover reopen', async ({ page }) => {
  const created = await createCard(page, `activity-140-${Date.now()}`, 1120, 260);
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');
  const text140 = 'z'.repeat(140);

  await composer.fill(text140);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(popover.locator('.activity-log-popover__entry-body').first()).toHaveText(text140);
  await expect(popover.locator('.activity-log-popover__entry-time').first()).toHaveText(/\S+/);

  await page.keyboard.press('Escape');
  await expect(page.locator('.activity-log-popover')).toBeHidden();

  const reopened = await openActivityLogPopover(page, created);
  await expect(reopened.locator('.activity-log-popover__entry-body').first()).toHaveText(text140);
});

test('activity log keeps retained history in storage while UI remains capped at five', async ({ page }) => {
  const created = await createCard(page, `activity-retain-${Date.now()}`, 1120, 260);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();
  const popover = await openActivityLogPopover(page, created);
  const composer = popover.locator('.activity-log-popover__composer');
  const save = popover.locator('.activity-log-popover__save');

  for (let i = 1; i <= 7; i++) {
    await composer.fill(`retained ${i}`);
    await save.click();
    await expect(composer).toHaveValue('');
  }

  const bodies = popover.locator('.activity-log-popover__entry-body');
  await expect(bodies).toHaveCount(5);
  await expect(bodies.nth(0)).toHaveText('retained 7');
  await expect(bodies.nth(4)).toHaveText('retained 3');
  expect(activityLogCountInDb(id!)).toBe(7);
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
  const staleSeed = await createCard(page, `stale-${Date.now()}`, 220, 180);
  const staleSeedId = await staleSeed.getAttribute('data-id');
  expect(staleSeedId).toBeTruthy();
  await expect(staleSeed).toHaveAttribute('data-saved', 'true');

  ageCardInDb(staleSeedId!, 10);
  await page.reload();

  const staleCard = page.locator(`.pin[data-id="${staleSeedId}"]`);
  await expect(staleCard).toHaveAttribute('data-stale', 'true');

  const activeCard = await createCard(page, `active-${Date.now()}`, 1140, 640);
  await expect(activeCard).toHaveAttribute('data-stale', 'false');

  const staleNormal = await pinChrome(staleCard);
  const activeNormal = await pinChrome(activeCard);

  expect(staleNormal.borderColor).not.toBe(activeNormal.borderColor);
  expect(staleNormal.boxShadow).not.toBe(activeNormal.boxShadow);

  await staleCard.locator('.pin-title input').focus();
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

test('delete undo waits for persistence before restoring card', async ({ page }) => {
  const title = `delete-undo-fail-${Date.now()}`;
  const created = await createCard(page, title, 1160, 320);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();

  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-delete').click();
  await expect(page.locator('.undo-toast')).toContainText('Deleted');
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);

  let failedUndoOnce = false;
  await page.route('**/api/items', async (route, request) => {
    if (!failedUndoOnce && request.method() === 'POST') {
      failedUndoOnce = true;
      await route.fulfill({ status: 500, body: 'restore failed' });
      return;
    }
    await route.continue();
  });

  await page.locator('.undo-btn').click();
  await expect(page.locator('.canvas-warning')).toContainText(/Unable to restore deleted card\.|restore failed/);
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(0);
  expect(failedUndoOnce).toBeTruthy();
});

test('mutation failure logs include structured context for context-title and pin save', async ({ page }) => {
  const collected = collectMutationFailureLogs(page);

  let contextSaveFailed = false;
  await page.route('**/api/contexts', async (route, request) => {
    if (!contextSaveFailed && request.method() === 'POST') {
      contextSaveFailed = true;
      await route.fulfill({ status: 500, body: 'context save failed' });
      return;
    }
    await route.continue();
  });

  const contextName = page.locator('#context-name');
  await contextName.focus();
  await contextName.evaluate((el, value) => {
    el.textContent = String(value);
    (el as HTMLElement).blur();
  }, `ctx-log-${Date.now()}`);
  await expect(page.locator('.canvas-warning')).toContainText('Unable to save context title');

  let saveFailed = false;
  await page.route('**/api/items', async (route, request) => {
    if (!saveFailed && request.method() === 'POST') {
      saveFailed = true;
      await route.fulfill({ status: 500, body: 'item save failed' });
      return;
    }
    await route.continue();
  });

  const pin = page.locator('.pin').first();
  await pin.locator('.pin-title input').fill(`save-log-${Date.now()}`);
  await pin.locator('.pin-title input').blur();
  await expect(page.locator('.canvas-warning')).toContainText('Unable to save card changes');

  expect(hasMutationLog(collected.logs, 'context-title-save', '/api/contexts')).toBeTruthy();
  expect(hasMutationLog(collected.logs, 'save-pin', '/api/items')).toBeTruthy();
  collected.stop();
});

test('mutation failure logs include structured context for hide failures', async ({ page }) => {
  const collected = collectMutationFailureLogs(page);
  const created = await createCard(page, `hide-log-${Date.now()}`);
  let failedOnce = false;

  await page.route('**/api/items/hide', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.fulfill({ status: 500, body: 'hide failed' });
      return;
    }
    await route.continue();
  });

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.canvas-warning')).toContainText('Unable to hide card');
  expect(failedOnce).toBeTruthy();
  expect(hasMutationLog(collected.logs, 'hide-pin', '/api/items/hide')).toBeTruthy();
  collected.stop();
});

test('mutation failure logs include structured context for delete failures', async ({ page }) => {
  const collected = collectMutationFailureLogs(page);
  const created = await createCard(page, `delete-log-${Date.now()}`);
  const id = await created.getAttribute('data-id');
  expect(id).toBeTruthy();
  let failedOnce = false;

  await page.route('**/api/items/delete', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-delete').click();
  await expect(page.locator(`.pin[data-id="${id}"]`)).toHaveCount(1);
  expect(failedOnce).toBeTruthy();
  await expect.poll(() => collected.logs.length).toBeGreaterThan(0);
  const deleteLogText = collected.logs.join('\n');
  expect(deleteLogText).toContain('"operation":"delete-pin"');
  expect(deleteLogText).toContain('/api/items/delete');
  collected.stop();
});

test('mutation failure logs include structured context for touch and complete failures', async ({ page }) => {
  const collected = collectMutationFailureLogs(page);
  const created = await createCard(page, `touch-complete-log-${Date.now()}`);

  let touchFailed = false;
  await page.route('**/api/items/touch', async (route, request) => {
    if (!touchFailed && request.method() === 'POST') {
      touchFailed = true;
      await route.fulfill({ status: 500, body: 'touch failed' });
      return;
    }
    await route.continue();
  });

  await created.locator('.pin-touch').click();
  await expect(page.locator('.canvas-warning')).toContainText(/Unable to touch card\.|touch failed/);

  let completeFailed = false;
  await page.route('**/api/items/complete', async (route, request) => {
    if (!completeFailed && request.method() === 'POST') {
      completeFailed = true;
      await route.fulfill({ status: 500, body: 'complete failed' });
      return;
    }
    await route.continue();
  });

  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-complete').click();
  await expect(page.locator('.canvas-warning')).toContainText(/Unable to complete card\.|complete failed/);

  expect(touchFailed).toBeTruthy();
  expect(completeFailed).toBeTruthy();
  expect(hasMutationLog(collected.logs, 'touch-pin', '/api/items/touch')).toBeTruthy();
  expect(hasMutationLog(collected.logs, 'complete-pin', '/api/items/complete')).toBeTruthy();
  collected.stop();
});

test('mutation failure logs include structured context for unhide failures', async ({ page }) => {
  const collected = collectMutationFailureLogs(page);
  const title = `unhide-log-${Date.now()}`;
  const created = await createCard(page, title);

  await ensureFiltersTrayOpen(page);
  await openActionDrawer(created);
  await created.locator('.pin-action-drawer .pin-hide').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => getHiddenCount(page)).toBeGreaterThan(0);

  let unhideFailed = false;
  await page.route('**/api/items/unhide-at', async (route, request) => {
    if (!unhideFailed && request.method() === 'POST') {
      unhideFailed = true;
      await route.fulfill({ status: 500, body: 'unhide failed' });
      return;
    }
    await route.continue();
  });

  const hiddenToggle = page.locator('#hidden-toggle');
  await hiddenToggle.click();
  const hiddenItem = page.locator('.hidden-tray-item', { hasText: title }).first();
  await expect(hiddenItem).toBeVisible();
  await hiddenItem.dragTo(page.locator('#surface'), { targetPosition: { x: 360, y: 300 } });

  await expect(page.locator('.canvas-warning')).toContainText(/unhide item|unhide failed/i);
  expect(unhideFailed).toBeTruthy();
  expect(hasMutationLog(collected.logs, 'unhide-at', '/api/items/unhide-at')).toBeTruthy();
  collected.stop();
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

  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(surfaceBox).not.toBeNull();
  const candidatePositions = [
    { x: 1080, y: 640 },
    { x: 1120, y: 140 },
    { x: 240, y: 640 },
    { x: 240, y: 140 },
  ];
  let added = false;
  for (const p of candidatePositions) {
    await page.mouse.click(surfaceBox!.x + p.x, surfaceBox!.y + p.y);
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
  const newTitle = `Main Orbit ${Date.now()} ${'Orbit '.repeat(20)}gentle boundary clamp check`;
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
  const reloadedName = page.locator('#context-name');
  await expect(reloadedName).toHaveText(newTitle);
  const contextBox = await page.locator('.context-head').boundingBox();
  const surfaceBox = await page.locator('#surface').boundingBox();
  expect(contextBox).not.toBeNull();
  expect(surfaceBox).not.toBeNull();
  expect(contextBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x);
  expect(contextBox!.x + contextBox!.width).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width);
});

test('context title save failure restores previous value and shows warning', async ({ page }) => {
  const name = page.locator('#context-name');
  await expect(name).toBeVisible();
  const previousTitle = ((await name.textContent()) || '').trim() || 'Main Orbit';
  let failedOnce = false;

  await page.route('**/api/contexts', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.fulfill({ status: 500, body: 'context save failed' });
      return;
    }
    await route.continue();
  });

  const nextTitle = `ctx-fail-${Date.now()}`;
  await name.focus();
  await name.evaluate((el, value) => {
    el.textContent = String(value);
    (el as HTMLElement).blur();
  }, nextTitle);
  await expect(page.locator('.canvas-warning')).toContainText('Unable to save context title. Restored previous value.');
  await expect(name).toHaveText(previousTitle);
  expect(failedOnce).toBeTruthy();
});

test('card save failure keeps local draft unsaved and shows warning', async ({ page }) => {
  const pin = page.locator('.pin').first();
  await expect(pin).toBeVisible();
  const titleInput = pin.locator('.pin-title input');
  const nextTitle = `card-fail-${Date.now()}`;
  let failedOnce = false;

  await page.route('**/api/items', async (route, request) => {
    if (!failedOnce && request.method() === 'POST') {
      failedOnce = true;
      await route.fulfill({ status: 500, body: 'item save failed' });
      return;
    }
    await route.continue();
  });

  await titleInput.fill(nextTitle);
  await titleInput.blur();
  await expect(page.locator('.canvas-warning')).toContainText('Unable to save card changes. Your edits are kept locally.');
  await expect(titleInput).toHaveValue(nextTitle);
  await expect(pin).toHaveAttribute('data-saved', 'false');
  expect(failedOnce).toBeTruthy();
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
