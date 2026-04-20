import { test, expect } from '@playwright/test';

async function createContext(page, title: string) {
  return page.evaluate(async (contextTitle) => {
    const id = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const response = await fetch('/api/contexts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: contextTitle, x: 560, y: 320, color: 'var(--c1)' }),
    });
    if (!response.ok) {
      throw new Error(`failed to create context (${response.status})`);
    }
    return { id, title: contextTitle };
  }, title);
}

test('focus view renders chrome context strip with compact counts', async ({ page }) => {
  await page.goto('/');

  const strip = page.locator('#chrome-context-strip');
  await expect(strip).toBeVisible();

  const firstPill = strip.locator('.chrome-context-strip__pill').first();
  await expect(firstPill).toBeVisible();
  await expect(firstPill).toContainText(/\d+\/\d+/);
  await expect(firstPill).toHaveClass(/chrome-context-strip__pill--active/);
});

test('context strip keeps fixed pill order when active context changes', async ({ page }) => {
  await page.goto('/');

  const ctxA = await createContext(page, 'Order A');
  await createContext(page, 'Order B');
  await page.reload();

  const labelsBefore = await page.locator('.chrome-context-strip__pill .chrome-context-strip__pill-label').allTextContents();
  await page.locator('.chrome-context-strip__pill', { hasText: ctxA.title }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]ctx=${ctxA.id}`));
  const labelsAfter = await page.locator('.chrome-context-strip__pill .chrome-context-strip__pill-label').allTextContents();

  expect(labelsAfter).toEqual(labelsBefore);
});

test('context pill hover tooltip uses exact total/stale format and updates per pill', async ({ page }) => {
  await page.goto('/');

  const ctxA = await createContext(page, 'Tooltip A');
  const ctxB = await createContext(page, 'Tooltip B');
  await page.reload();

  const pillA = page.locator('.chrome-context-strip__pill', { hasText: ctxA.title });
  const pillB = page.locator('.chrome-context-strip__pill', { hasText: ctxB.title });

  await expect(pillA).toBeVisible();
  await expect(pillB).toBeVisible();

  const countA = await pillA.locator('.chrome-context-strip__pill-count').innerText();
  const [totalA, staleA] = countA.split('/');
  await pillA.hover();
  await expect(pillA).toHaveAttribute('title', `Total: ${totalA}; Stale : ${staleA}`);

  const beforeURL = page.url();
  const countB = await pillB.locator('.chrome-context-strip__pill-count').innerText();
  const [totalB, staleB] = countB.split('/');
  await pillB.hover();
  await expect(pillB).toHaveAttribute('title', `Total: ${totalB}; Stale : ${staleB}`);
  await expect(page).toHaveURL(beforeURL);
});

test('chrome context strip supports overflow and one-click context switching', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 8; i++) {
    await createContext(page, `Ctx ${i}`);
  }

  const target = await createContext(page, 'SwitchTarget');
  await page.reload();

  const overflowToggle = page.locator('.chrome-context-strip__overflow-toggle');
  await expect(overflowToggle).toBeVisible();
  await expect(overflowToggle).toContainText(/^\+\d+$/);

  await overflowToggle.click();
  const overflowPanel = page.locator('.chrome-context-strip__overflow');
  await expect(overflowPanel).toBeVisible();

  await overflowPanel.locator('.chrome-context-strip__overflow-item', { hasText: target.title }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]ctx=${target.id}`));
});
