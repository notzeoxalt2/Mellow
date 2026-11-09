#!/usr/bin/env node

/**
 * Local-only UI interaction smoke for an isolated packaged Mellow app.
 * Requires launching the app with launch-qa-candidate.ps1 -RemoteDebuggingPort.
 * Navigation, scroll position, the video-preview setting, and the ephemeral
 * now-playing panel are exercised. The setting is toggled once and restored
 * to its original value. No account data or playback controls are touched.
 */
const portArgument = process.argv.slice(2).find((argument) => argument !== '--');
const port = Number(portArgument || 0);
if (!Number.isInteger(port) || port < 9222 || port > 65535) {
  console.error('Usage: node scripts/desktop-smoke.mjs <loopback-debug-port>');
  process.exit(2);
}

const base = `http://127.0.0.1:${port}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 12_000;
let target;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/json/list`);
    if (!response.ok) throw new Error(`CDP endpoint returned ${response.status}`);
    const targets = await response.json();
    target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
    if (target) break;
  } catch { /* app is still starting */ }
  await delay(250);
}
if (!target) throw new Error(`No Electron page target appeared on 127.0.0.1:${port}`);
if (!target.webSocketDebuggerUrl.startsWith(`ws://127.0.0.1:${port}/`)) {
  throw new Error('Refusing a non-loopback Chrome DevTools target');
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const runtimeErrors = [];
const rejectedLocalRequests = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails?.text || 'Uncaught renderer exception');
  }
  if (message.method === 'Network.loadingFailed') {
    const url = message.params?.requestId && requestUrls.get(message.params.requestId);
    if (url?.startsWith('file:') || url?.startsWith('http://127.0.0.1')) rejectedLocalRequests.push(url);
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
const requestUrls = new Map();

function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await Promise.all([call('Runtime.enable'), call('Page.enable'), call('Network.enable')]);
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.requestWillBeSent') requestUrls.set(message.params.requestId, message.params.request.url);
});

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
  return result.result?.value;
}

async function waitFor(predicate, label) {
  const until = Date.now() + 8_000;
  while (Date.now() < until) {
    if (await evaluate(predicate)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const checks = [];
async function visit(label, route, expectedText) {
  const navigated = await evaluate(`(() => {
    const anchor = [...document.querySelectorAll('a[href]')].find(a => {
      const href = a.getAttribute('href') || '';
      return href === '#${route}' || href.endsWith('#${route}') || href.endsWith('${route}');
    });
    if (!anchor) return false;
    anchor.click();
    return true;
  })()`);
  if (!navigated) throw new Error(`Could not find an in-app link for ${label} (${route})`);
  await waitFor(`location.hash.includes(${JSON.stringify(route)})`, `${label} route`);
  await waitFor(`document.body.innerText.toLowerCase().includes(${JSON.stringify(expectedText.toLowerCase())})`, `${label} content`);
  checks.push({ route: label, passed: true });
}

async function checkNowPlayingPanel() {
  // The isolated profile can be reused across smoke runs. Normalize the
  // toggle to a known closed state before asserting the open transition.
  const initiallyOpen = await evaluate(`!!document.querySelector('aside[aria-label="Now Playing"]')`);
  if (initiallyOpen) {
    const closedInitially = await evaluate(`(() => {
      const button = document.querySelector('button[aria-label="Close Now Playing"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!closedInitially) throw new Error('Now Playing panel was open but its close control was missing');
    await waitFor("!document.querySelector('aside[aria-label=\"Now Playing\"]')", 'initial now-playing panel close');
  }

  const opened = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Now Playing details"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!opened) throw new Error('Could not find the Now Playing details control');
  await waitFor(`document.querySelector('button[aria-label="Now Playing details"]')?.getAttribute('aria-pressed') === 'true' && !!document.querySelector('aside[aria-label="Now Playing"]')`, 'now-playing panel open');
  await waitFor("!!document.querySelector('aside[aria-label=\"Now Playing\"]')", 'now-playing side panel');
  // SidePanel lazy-loads NowPlayingPanel on first open. Wait for its actual
  // close button instead of assuming the chunk is mounted after a fixed delay.
  await waitFor("!!document.querySelector('button[aria-label=\"Close Now Playing\"]')", 'now-playing panel controls');
  const closed = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Close Now Playing"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!closed) throw new Error('Could not find the close control in the now-playing panel');
  await waitFor("!document.querySelector('aside[aria-label=\"Now Playing\"]')", 'now-playing panel close');
  checks.push({ interaction: 'now-playing panel open/close', passed: true });
}

async function checkPageScroll() {
  const result = await evaluate(`(() => {
    const page = document.querySelector('#scrollable-page');
    const sidebar = document.querySelector('.mellow-sidebar-scroll');
    if (!page || !sidebar) return null;
    const pageOverflowY = getComputedStyle(page).overflowY;
    const sidebarOverflowY = getComputedStyle(sidebar).overflowY;
    page.scrollTop = 72;
    sidebar.scrollTop = 72;
    return {
      pageOverflowY,
      sidebarOverflowY,
      pageScrollResponded: page.scrollTop > 0 || page.scrollHeight <= page.clientHeight,
      sidebarScrollResponded: sidebar.scrollTop > 0 || sidebar.scrollHeight <= sidebar.clientHeight,
    };
  })()`);
  if (!result || !['auto', 'scroll'].includes(result.pageOverflowY) || !['auto', 'scroll'].includes(result.sidebarOverflowY)) {
    throw new Error(`Expected independently scrollable page and sidebar, got ${JSON.stringify(result)}`);
  }
  if (!result.pageScrollResponded || !result.sidebarScrollResponded) {
    throw new Error(`Page or sidebar did not respond to a scroll position: ${JSON.stringify(result)}`);
  }
  checks.push({ interaction: 'page/sidebar scroll containers', passed: true });
}

async function checkVideoPreviewSetting() {
  const initial = await evaluate(`(() => {
    const row = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Play music videos'));
    const input = row?.querySelector('input[type="checkbox"]');
    return input ? { checked: input.checked, disabled: input.disabled } : null;
  })()`);
  if (!initial || initial.disabled) throw new Error(`Play music videos setting is not interactive: ${JSON.stringify(initial)}`);

  const clickSetting = () => evaluate(`(() => {
    const row = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Play music videos'));
    const input = row?.querySelector('input[type="checkbox"]');
    if (!input || input.disabled) return false;
    input.click();
    return true;
  })()`);
  const readSetting = () => evaluate(`(() => {
    const row = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Play music videos'));
    return row?.querySelector('input[type="checkbox"]')?.checked ?? null;
  })()`);

  let changed = false;
  try {
    if (!await clickSetting()) throw new Error('Could not click Play music videos');
    await waitFor(`(() => {
      const row = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Play music videos'));
      return row?.querySelector('input[type="checkbox"]')?.checked === ${!initial.checked};
    })()`, 'Play music videos setting toggle');
    changed = true;
  } finally {
    const current = await readSetting();
    if (current !== initial.checked) {
      if (!await clickSetting()) throw new Error('Could not restore Play music videos to its initial value');
      await waitFor(`(() => {
        const row = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Play music videos'));
        return row?.querySelector('input[type="checkbox"]')?.checked === ${initial.checked};
      })()`, 'Play music videos setting restore');
    }
  }
  if (!changed || await readSetting() !== initial.checked) {
    throw new Error('Play music videos setting did not complete a toggle-and-restore round trip');
  }
  checks.push({ interaction: 'Play music videos setting toggles and restores', passed: true, initialValue: initial.checked });
}

async function checkCategoryCatalog() {
  await waitFor("!!document.querySelector('[role=tablist][aria-label=\"Category source\"]')", 'category source tabs');

  const apple = await evaluate(`(() => {
    const tab = document.querySelector('[role="tablist"][aria-label="Category source"] [role="tab"][aria-selected="true"]');
    const tiles = document.querySelectorAll('a[aria-label^="Browse "]');
    const acoustic = document.querySelector('a[aria-label="Browse Acoustic"]');
    return { selected: tab?.textContent?.trim(), tileCount: tiles.length, acousticHref: acoustic?.getAttribute('href') ?? null };
  })()`);
  if (apple.selected !== 'Apple Music' || apple.tileCount < 150 || !apple.acousticHref) {
    throw new Error(`Apple editorial catalog did not render as expected: ${JSON.stringify(apple)}`);
  }

  const openedAppleCategory = await evaluate(`(() => {
    const tile = document.querySelector('a[aria-label="Browse Acoustic"]');
    if (!tile) return false;
    tile.click();
    return true;
  })()`);
  if (!openedAppleCategory) throw new Error('Could not open the Apple Music Acoustic category');
  await waitFor("location.hash.includes('/search') && new URLSearchParams(location.hash.split('?')[1] || '').get('q') === 'Acoustic'", 'Apple category search route');
  await waitFor("document.body.innerText.includes('Acoustic')", 'Apple category search content');
  checks.push({ interaction: 'Apple category artwork opens cross-service search', passed: true, catalogTiles: apple.tileCount });

  await visit('Search (category reset)', '/search', 'Browse the catalog');
  await waitFor("!!document.querySelector('[role=tablist][aria-label=\"Category source\"]')", 'category source tabs after reset');

  for (const [label, sectionName, tileSelector, loadingText, unavailableText] of [
    ['Spotify', 'Spotify Browse categories', 'section[aria-label="Spotify Browse categories"] a[aria-label^="Browse "]', 'Loading Spotify Browse categories…', 'Spotify’s Browse category feed is unavailable for this account or API session.'],
    ['YouTube Music', null, 'a[aria-label^="Browse YouTube Music "]', 'Loading YouTube Music categories…', 'YouTube Music’s genre feed did not load. Check its connection, then retry.'],
  ]) {
    const clicked = await evaluate(`(() => {
      const tab = [...document.querySelectorAll('[role="tablist"][aria-label="Category source"] [role="tab"]')].find(item => item.textContent.trim() === ${JSON.stringify(label)});
      if (!tab) return false;
      tab.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Could not find the ${label} category source tab`);
    await waitFor(`document.querySelector('[role="tablist"][aria-label="Category source"] [role="tab"][aria-selected="true"]')?.textContent?.trim() === ${JSON.stringify(label)}`, `${label} category selection`);
    await waitFor(`!document.body.innerText.includes(${JSON.stringify(loadingText)})`, `${label} category feed to settle`);

    const state = await evaluate(`(() => ({
      section: ${sectionName ? `!!document.querySelector(${JSON.stringify(`section[aria-label="${sectionName}"]`)})` : `!!document.querySelector('section[aria-label]')`},
      tiles: document.querySelectorAll(${JSON.stringify(tileSelector)}).length,
      unavailable: document.body.innerText.includes(${JSON.stringify(unavailableText)}),
    }))()`);
    if (!state.section && !state.unavailable) {
      throw new Error(`${label} catalog showed neither usable categories nor a clear unavailable state: ${JSON.stringify(state)}`);
    }
    if (state.section && state.tiles === 0) throw new Error(`${label} catalog rendered an empty category section`);
    checks.push({ interaction: `${label} category source`, passed: true, catalogTiles: state.tiles, unavailable: state.unavailable });

    if (label === 'YouTube Music' && state.tiles > 0) {
      const target = await evaluate(`(() => {
        const tile = document.querySelector(${JSON.stringify(tileSelector)});
        if (!tile) return null;
        const href = tile.getAttribute('href');
        tile.click();
        return href;
      })()`);
      if (!target || !target.includes('/browse/')) throw new Error(`YouTube Music category did not link to its browse catalog: ${target}`);
      await waitFor("location.hash.includes('/browse/')", 'YouTube Music category browse route');
      await waitFor("!document.querySelector('[aria-busy=\"true\"]')", 'YouTube Music category results');
      const browseState = await evaluate(`({
        title: document.querySelector('h1')?.textContent?.trim() || document.querySelector('h2')?.textContent?.trim() || '',
        hasRows: document.querySelectorAll('main a[href], main button').length > 0,
        empty: document.body.innerText.includes('Nothing here yet'),
        error: document.body.innerText.includes('Something went wrong'),
      })`);
      if (!browseState.title || browseState.empty || browseState.error) {
        throw new Error(`YouTube Music category opened without usable browse results: ${JSON.stringify(browseState)}`);
      }
      checks.push({ interaction: 'YouTube Music category opens real browse results', passed: true, title: browseState.title, hasRows: browseState.hasRows });
      await visit('Search (return from YouTube category)', '/search', 'Browse the catalog');
      await waitFor("!!document.querySelector('[role=tablist][aria-label=\"Category source\"]')", 'category source tabs after YouTube browse');
      const reselected = await evaluate(`(() => {
        const tab = [...document.querySelectorAll('[role="tablist"][aria-label="Category source"] [role="tab"]')].find(item => item.textContent.trim() === 'YouTube Music');
        tab?.click();
        return !!tab;
      })()`);
      if (!reselected) throw new Error('Could not restore the YouTube Music category source');
      await waitFor("document.querySelector('[role=tablist][aria-label=\"Category source\"] [role=tab][aria-selected=\"true\"]')?.textContent?.trim() === 'YouTube Music'", 'YouTube Music category source restore');
    }
  }

  // Leave the packaged candidate in the same neutral state it started in.
  const reset = await evaluate(`(() => {
    const tile = document.querySelector('[role="tablist"][aria-label="Category source"] [role="tab"]');
    if (!tile) return false;
    tile.click();
    return true;
  })()`);
  if (!reset) throw new Error('Could not restore the default Apple Music category source');
  await waitFor("document.querySelector('[role=tablist][aria-label=\"Category source\"] [role=tab][aria-selected=\"true\"]')?.textContent?.trim() === 'Apple Music'", 'default category source restore');
}

try {
  await waitFor("document.querySelector('#root')?.childElementCount > 0", 'app mount');
  await visit('Home', '/home', 'Home');
  await visit('Search', '/search', 'Browse the catalog');
  await checkCategoryCatalog();
  await visit('New', '/new', 'New');
  await visit('Settings', '/settings', 'Settings');
  await checkVideoPreviewSetting();
  await visit('Themes', '/themes', 'Themes');
  await visit('Settings (return)', '/settings', 'Settings');
  await visit('Playlist Sync', '/sync', 'Playlist Sync');
  await visit('Settings (return)', '/settings', 'Settings');
  await visit('Extension', '/extension', 'Extension');
  await visit('Settings (final)', '/settings', 'Settings');
  await checkPageScroll();
  await visit('Home (return)', '/home', 'Home');
  await checkNowPlayingPanel();
  const summary = await evaluate(`({ title: document.title, hash: location.hash, mounted: !!document.querySelector('#root')?.childElementCount })`);
  if (runtimeErrors.length) throw new Error(`Renderer exceptions: ${runtimeErrors.join(' | ')}`);
  if (rejectedLocalRequests.length) throw new Error(`Local app assets failed: ${[...new Set(rejectedLocalRequests)].join(', ')}`);
  console.log(JSON.stringify({ ok: true, loopbackOnly: true, checks, summary, rendererExceptions: 0, failedLocalAssets: 0 }, null, 2));
} finally {
  ws.close();
}
