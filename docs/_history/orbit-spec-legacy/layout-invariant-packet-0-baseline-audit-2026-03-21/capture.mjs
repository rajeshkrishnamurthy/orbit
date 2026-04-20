import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const projectRoot = '/Users/rajeshk/.openclaw/projects/orbit';
const outRoot = path.join(projectRoot, 'spec', 'layout-invariant-packet-0-baseline-audit-2026-03-21');
const screenshotDir = path.join(outRoot, 'screenshots');
const baseURL = 'http://127.0.0.1:18101';
const profiles = [
  { name: 'wide-default', width: 1440, height: 900, zoom: 1.0 },
  { name: 'medium-default', width: 1280, height: 800, zoom: 1.0 },
  { name: 'narrow-default', width: 1024, height: 768, zoom: 1.0 },
  { name: 'wide-zoom125', width: 1440, height: 900, zoom: 1.25 },
];
const systemSelectors = [
  ['app-title', '.app-title'],
  ['subtitle', '.sub'],
  ['context-head', '.context-head'],
  ['toolbar', '#toolbar'],
  ['hidden-toggle', '#hidden-toggle'],
  ['lens-wrap', '.lens-wrap'],
  ['lens-slider-wrap', '.lens-slider-wrap'],
  ['open-contexts', '#open-contexts'],
  ['hidden-tray', '.hidden-tray'],
  ['context-confirm', '.context-confirm'],
  ['canvas-warning', '.canvas-warning'],
  ['undo-toast', '.undo-toast'],
];

function rectFromBox(box) {
  if (!box) return null;
  return {
    x: Number(box.x.toFixed(2)),
    y: Number(box.y.toFixed(2)),
    width: Number(box.width.toFixed(2)),
    height: Number(box.height.toFixed(2)),
    right: Number((box.x + box.width).toFixed(2)),
    bottom: Number((box.y + box.height).toFixed(2)),
  };
}

function intersects(a, b) {
  if (!a || !b) return false;
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
}

async function elementInfo(page, selector) {
  const loc = page.locator(selector);
  const count = await loc.count();
  if (!count) {
    return { selector, present: false, visible: false, rect: null, text: '' };
  }
  const first = loc.first();
  const visible = await first.isVisible().catch(() => false);
  let rect = null;
  if (visible) rect = rectFromBox(await first.boundingBox());
  const text = visible ? (await first.textContent().catch(() => '')) || '' : '';
  return { selector, present: true, visible, rect, text: text.trim() };
}

async function captureProfile(browser, profile) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height } });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  if (profile.zoom !== 1) {
    await page.evaluate((zoom) => {
      document.documentElement.style.zoom = String(zoom);
    }, profile.zoom);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(250);

  const surfaceBox = rectFromBox(await page.locator('#surface').boundingBox());
  const elements = [];
  for (const [name, selector] of systemSelectors) {
    const info = await elementInfo(page, selector);
    elements.push({ name, ...info });
  }
  const overlaps = elements
    .filter((el) => el.visible && el.rect)
    .map((el) => ({
      name: el.name,
      selector: el.selector,
      intersectsCanvas: intersects(el.rect, surfaceBox),
      rect: el.rect,
    }));
  const pass = overlaps.every((entry) => !entry.intersectsCanvas);

  const screenshotPath = path.join(screenshotDir, `${profile.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await context.close();
  return {
    ...profile,
    pass,
    surfaceBox,
    overlaps,
    screenshot: path.relative(outRoot, screenshotPath),
    observedAt: new Date().toISOString(),
  };
}

async function createCard(page, title, x = 1050, y = 620) {
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
  if (!added) throw new Error('failed to create a card');
  const pin = pins.nth(before);
  const titleInput = pin.locator('.pin-title input');
  await titleInput.fill(title);
  await titleInput.blur();
  await page.waitForTimeout(400);
  return pin;
}

async function dragBy(page, pin, dx, dy) {
  const box = await pin.boundingBox();
  if (!box) throw new Error('missing pin box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

async function pinSnapshot(pin) {
  const box = await pin.boundingBox();
  const data = await pin.evaluate((el) => ({
    id: el.getAttribute('data-id'),
    title: el.querySelector('.pin-title input')?.value || '',
    stale: el.getAttribute('data-stale'),
    active: el.getAttribute('data-active'),
    left: el.style.left,
    top: el.style.top,
    saved: el.getAttribute('data-saved'),
    persistedTitle: el.getAttribute('data-persisted-title'),
    persistedSubNote: el.getAttribute('data-persisted-sub-note'),
  }));
  return { ...data, box: rectFromBox(box) };
}

async function captureTrace(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const requests = [];
  page.on('request', async (req) => {
    if (req.url().endsWith('/api/items') && req.method() === 'POST') {
      requests.push({
        kind: 'request',
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
        timestamp: new Date().toISOString(),
      });
    }
  });
  page.on('response', async (res) => {
    if (res.url().endsWith('/api/items') && res.request().method() === 'POST') {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        bodyText = '';
      }
      requests.push({
        kind: 'response',
        url: res.url(),
        status: res.status(),
        bodyText,
        timestamp: new Date().toISOString(),
      });
    }
  });

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const loadItems = await page.evaluate(() =>
    (window.__ITEMS__ || []).slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      x: item.x,
      y: item.y,
      active: item.active,
      stale: item.stale,
      hidden: item.hidden,
      contextId: item.contextId,
    })),
  );
  const firstExisting = page.locator('.pin').first();
  const firstExistingSnapshot = await pinSnapshot(firstExisting);

  const title = `packet0-trace-${Date.now()}`;
  const createReqsBefore = requests.length;
  const created = await createCard(page, title, 1080, 620);
  const createdId = await created.getAttribute('data-id');
  const createSnapshot = await pinSnapshot(created);
  const createRequests = requests.slice(createReqsBefore);

  const dragReqsBefore = requests.length;
  await dragBy(page, created, -180, -220);
  const dragSnapshot = await pinSnapshot(created);
  const dragRequests = requests.slice(dragReqsBefore);

  await page.reload({ waitUntil: 'networkidle' });
  const reloaded = page.locator(`.pin[data-id="${createdId}"]`);
  const persistSnapshot = await pinSnapshot(reloaded);
  const persistedLoadItems = await page.evaluate((needle) => {
    const items = window.__ITEMS__ || [];
    return items.filter((item) => item.id === needle).map((item) => ({
      id: item.id,
      title: item.title,
      x: item.x,
      y: item.y,
      active: item.active,
      stale: item.stale,
      hidden: item.hidden,
      contextId: item.contextId,
    }));
  }, createdId);

  await context.close();
  return {
    load: {
      items: loadItems,
      firstExistingPin: firstExistingSnapshot,
    },
    create: {
      title,
      createdId,
      requests: createRequests,
      snapshot: createSnapshot,
    },
    dragMove: {
      requests: dragRequests,
      snapshot: dragSnapshot,
    },
    persist: {
      snapshot: persistSnapshot,
      windowItems: persistedLoadItems,
    },
  };
}

function buildBoundaryMapMarkdown(profileResults) {
  const defaultProfile = profileResults[0];
  const lines = [];
  lines.push('# Packet 0 Boundary Map');
  lines.push('');
  lines.push(`Captured from profile: ${defaultProfile.name} (${defaultProfile.width}x${defaultProfile.height} @ ${Math.round(defaultProfile.zoom * 100)}%)`);
  lines.push('');
  lines.push('| Element | Selector | Visible | Rect | Relation to #surface |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const el of defaultProfile.overlaps) {
    const relation = el.intersectsCanvas ? 'inside/overlapping canvas' : 'outside canvas';
    lines.push(`| ${el.name} | \`${el.selector}\` | ${el.rect ? 'yes' : 'no'} | ${el.rect ? `${el.rect.x},${el.rect.y} ${el.rect.width}x${el.rect.height}` : 'n/a'} | ${relation} |`);
  }
  lines.push('');
  lines.push('Current summary: the app title/subtitle remain above the canvas, while the context header, toolbar, hidden toggle, and lens controls render inside the surface/canvas region in the baseline layout.');
  return lines.join('\n');
}

function buildOverlapMatrixMarkdown(profileResults) {
  const lines = [];
  lines.push('# Packet 0 Overlap Matrix');
  lines.push('');
  lines.push('| Profile | Viewport | Zoom | Result | Screenshot | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const profile of profileResults) {
    const notes = profile.overlaps.filter((o) => o.intersectsCanvas).map((o) => o.name).join(', ') || 'none';
    lines.push(`| ${profile.name} | ${profile.width}x${profile.height} | ${Math.round(profile.zoom * 100)}% | ${profile.pass ? 'PASS' : 'FAIL'} | [${path.basename(profile.screenshot)}](./${profile.screenshot}) | overlaps: ${notes} |`);
  }
  lines.push('');
  lines.push('Baseline verdict: these profiles currently fail the future layout-invariant target because system chrome is still rendered inside the canvas region.');
  return lines.join('\n');
}

function buildTraceMarkdown(trace) {
  const lines = [];
  lines.push('# Packet 0 Coordinate Trace Sample');
  lines.push('');
  lines.push('## Load');
  lines.push(JSON.stringify(trace.load, null, 2));
  lines.push('');
  lines.push('## Create');
  lines.push(JSON.stringify(trace.create, null, 2));
  lines.push('');
  lines.push('## Drag / Move');
  lines.push(JSON.stringify(trace.dragMove, null, 2));
  lines.push('');
  lines.push('## Persist after reload');
  lines.push(JSON.stringify(trace.persist, null, 2));
  return lines.join('\n');
}

function buildRiskMarkdown() {
  return `# Packet 0 Risk Register

| Risk | Why it matters | Baseline evidence |
| --- | --- | --- |
| Persisted coordinates may be canvas-relative or absolute-display | Packet 1 must know whether a migration is needed before enforcing boundary changes. | Trace sample captures create, drag/move, load, and persist coordinates. |
| Current chrome is rendered inside the canvas surface | Packet 1/2 need a stable boundary contract before moving controls. | Boundary map shows context head, toolbar, hidden toggle, and lens controls inside \`#surface\`. |
| Zoom/viewport pressure may change overlap behavior | Packet 2 must handle narrow widths and zoom without canvas intrusion. | Overlap matrix captures multiple viewport and zoom profiles. |
| Drag/save flows may write coordinates from DOM positions | Any future shell change can accidentally mutate coordinates if this path is not bounded. | Create and drag request traces show current request bodies. |
| Hidden tray / contextual overlays may need separate placement rules | These are likely to become system chrome candidates in Packet 2. | Boundary map and screenshot bundle document their current placement or hidden state. |`;
}

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const profileResults = [];
  for (const profile of profiles) {
    profileResults.push(await captureProfile(browser, profile));
  }
  const trace = await captureTrace(browser);
  await browser.close();

  const overlapMatrixPath = path.join(outRoot, 'overlap-matrix.json');
  const overlapMatrixMdPath = path.join(outRoot, 'overlap-matrix.md');
  const boundaryMapPath = path.join(outRoot, 'boundary-map.md');
  const tracePath = path.join(outRoot, 'coordinate-traces.json');
  const traceMdPath = path.join(outRoot, 'coordinate-traces.md');
  const riskPath = path.join(outRoot, 'risk-register.md');
  const notesPath = path.join(outRoot, 'implementation-notes.md');
  const manifestPath = path.join(outRoot, 'evidence-manifest.json');

  await fs.writeFile(overlapMatrixPath, JSON.stringify(profileResults, null, 2));
  await fs.writeFile(overlapMatrixMdPath, buildOverlapMatrixMarkdown(profileResults));
  await fs.writeFile(boundaryMapPath, buildBoundaryMapMarkdown(profileResults));
  await fs.writeFile(tracePath, JSON.stringify(trace, null, 2));
  await fs.writeFile(traceMdPath, buildTraceMarkdown(trace));
  await fs.writeFile(riskPath, buildRiskMarkdown());
  await fs.writeFile(notesPath, [
    '# Packet 0 Implementation Notes',
    '',
    'This folder is the Packet 0 evidence package for the layout-invariant rollout baseline.',
    '',
    '## Artifacts',
    '',
    '- [Overlap matrix](./overlap-matrix.md)',
    '- [Boundary map](./boundary-map.md)',
    '- [Coordinate traces](./coordinate-traces.md)',
    '- [Risk register](./risk-register.md)',
    '',
    '## Screenshots',
    '',
    ...profileResults.map((p) => `- [${p.name}](${p.screenshot})`),
  ].join('\n'));
  await fs.writeFile(manifestPath, JSON.stringify({
    packet: '0',
    generatedAt: new Date().toISOString(),
    baseURL,
    profiles: profileResults.map(({ name, width, height, zoom, pass, screenshot }) => ({ name, width, height, zoom, pass, screenshot })),
    artifacts: {
      overlapMatrixPath,
      overlapMatrixMdPath,
      boundaryMapPath,
      tracePath,
      traceMdPath,
      riskPath,
      notesPath,
    },
  }, null, 2));

  console.log(JSON.stringify({
    profiles: profileResults.map((p) => ({ name: p.name, pass: p.pass, screenshot: p.screenshot })),
    traceTitle: trace.create.title,
    createdId: trace.create.createdId,
    outRoot,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
