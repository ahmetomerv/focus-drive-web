const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const key = 'focusdrive.umami-consent.v1';
// Snapshot of the actual hosted tracker, not a simulated analytics implementation.
const tracker = readFileSync(require.resolve('./fixtures/umami.js'), 'utf8');
let requests;
test.beforeEach(async ({ context }) => {
  requests = [];
  await context.route('https://analytics.ahmeto.com/**', async route => {
    const request = route.request();
    requests.push({ url: request.url(), data: request.postDataJSON() });
    if (new URL(request.url()).pathname === '/script.js') {
      await route.fulfill({ contentType: 'application/javascript', body: tracker });
    } else {
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    }
  });
  await context.route(/googletagmanager|google-analytics/, route => route.abort());
});
const views = () => requests.filter(r => r.data);
const settle = page => page.waitForTimeout(450); // Covers the tracker's route debounce.

test('first visit and rejection never request Umami; rejection persists across pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Allow analytics', exact: true })).toBeVisible();
  await settle(page);
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.reload();
  await page.goto('/support.html');
  await settle(page);
  expect(requests).toEqual([]);
  await expect(page.getByRole('button', { name: 'Allow analytics', exact: true })).toBeHidden();
});

test('acceptance enables only sanitized pageviews; withdrawal blocks navigation and direct tracker calls', async ({ page }) => {
  await page.goto('/?secret=one#private');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(1);
  expect(views()[0].data.payload.url).toBe('/');
  await page.evaluate(() => history.pushState({}, '', '/support.html?secret=two#private'));
  await expect.poll(() => views().length).toBe(2);
  expect(views()[1].data.payload.url).toBe('/support.html');
  expect(views()[1].data.payload.referrer).not.toMatch(/[?#]/);
  await page.reload();
  await expect.poll(() => views().length).toBe(3);
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  const count = requests.length;
  await page.evaluate(() => {
    history.pushState({}, '', '/contact.html?private=yes#secret');
    umami.track();
    umami.track('custom-event');
    umami.identify('unwanted-user');
  });
  await settle(page);
  expect(requests).toHaveLength(count);
  await page.reload();
  await settle(page);
  expect(requests).toHaveLength(count);
  expect(views().every(r => r.data.type === 'event' && !r.data.payload.name && !r.data.payload.id)).toBe(true);
});

test('unavailable storage fails closed even when Allow is clicked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage denied'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await settle(page);
  expect(requests).toEqual([]);
  await expect(page.getByRole('status')).toContainText('could not be saved');
});

test('failed withdrawal stays blocked without reloading old acceptance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(1);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Full'); }; });
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  const count = requests.length;
  await page.evaluate(() => { history.pushState({}, '', '/privacy.html'); umami.track(); });
  await settle(page);
  expect(requests).toHaveLength(count);
  await expect(page.getByRole('status')).toContainText('blocked');
});

test('consent is synchronized across tabs, including storage clearing', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/support.html');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(2);
  await other.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await other.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('focusdrive.umami-consent.v1'))).toBe('declined');
  const count = requests.length;
  await page.evaluate(() => { history.pushState({}, '', '/contact.html'); umami.track(); });
  await settle(page);
  expect(requests).toHaveLength(count);
  await other.evaluate(() => localStorage.clear());
  await expect(page.getByRole('button', { name: 'Allow analytics', exact: true })).toBeVisible();
});

for (const width of [320, 768, 1440]) {
  test(`banner fits ${width}px and preferences support keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const allow = page.getByRole('button', { name: 'Allow analytics', exact: true });
    const decline = page.getByRole('button', { name: 'Decline', exact: true });
    const a = await allow.boundingBox(), d = await decline.boundingBox();
    expect(a.width).toBeCloseTo(d.width, 0);
    expect(a.height).toBeCloseTo(d.height, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await decline.focus();
    await page.keyboard.press('Enter');
    const preferences = page.getByRole('button', { name: 'Analytics preferences', exact: true });
    await expect(preferences).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(allow).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decline).toBeFocused();
    expect(requests).toEqual([]);
  });
}

test('withdrawal while the tracker is downloading prevents its initial pageview', async ({ page, context }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = false;
  await context.route('https://analytics.ahmeto.com/script.js', async route => {
    requested = true;
    await gate;
    await route.fulfill({ contentType: 'application/javascript', body: tracker });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  release();
  await settle(page);
  expect(views()).toEqual([]);
});

test('saved acceptance survives a new page; reaccepting sends one pageview without duplicate tracking', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(1);
  await page.getByRole('link', { name: 'Contact', exact: true }).click();
  await expect.poll(() => views().length).toBe(2);
  expect(views()[1].data.payload.url).toBe('/contact.html');
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(3);
  await settle(page);
  expect(views()).toHaveLength(3);
});

test('a saved acceptance cannot enable tracking when storage becomes unreadable', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'accepted');
    Storage.prototype.getItem = () => { throw new Error('Denied'); };
  }, key);
  await page.goto('/');
  await settle(page);
  expect(requests).toEqual([]);
});

test('failed withdrawal broadcasts a block to another accepted tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(1);
  const other = await context.newPage();
  await other.goto('/support.html');
  await expect.poll(() => views().length).toBe(2);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Denied'); }; });
  await page.getByRole('button', { name: 'Analytics preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await settle(other);
  const count = requests.length;
  await other.evaluate(() => { history.pushState({}, '', '/contact.html'); umami.track(); });
  await other.reload();
  await settle(other);
  expect(requests).toHaveLength(count);
});

test('referrer queries and fragments are removed from outgoing payloads', async ({ page }) => {
  await page.goto('/?secret=page#hidden', { referer: 'https://example.com/ref?secret=ref#hidden' });
  await page.getByRole('button', { name: 'Allow analytics', exact: true }).click();
  await expect.poll(() => views().length).toBe(1);
  expect(views()[0].data.payload.referrer).toBe('https://example.com/ref');
  expect(JSON.stringify(views()[0].data)).not.toContain('secret');
});

test('every production page has consent controls and no eager analytics', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/contact.html', '/privacy.html', '/support.html', '/terms.html']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Analytics preferences', exact: true })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Optional analytics' })).toBeVisible();
    expect(await page.locator('script[src*="analytics.ahmeto.com"]').count()).toBe(0);
    expect(await page.locator('script[src*="googletagmanager"], script[src*="google-analytics"]').count()).toBe(0);
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
