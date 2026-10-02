import { test, expect } from '@playwright/test';
import { prepare, firstSearch, NOW } from './helpers.mjs';

// MOCK offers for tests only. They are served from route interception (never from the repository) and prove the UI state
// contract, expiry and safety - they are NOT evidence of any live provider integration (see TICKETS.md).
const iso = (minAgo) => new Date(NOW.getTime() - minAgo * 60000).toISOString();
const GOOD = { match: 'exact', scope: 'occurrence', quantityBasis: 'per-ticket', feesIncluded: true, currency: 'EUR', url: 'https://www.sportsevents365.com/e/1?aff=test' };
function offers(extra) {
  return Object.assign({ schema: 1, provider: 'sportsevents365', generatedAt: iso(5), ttlMinutes: 60, priceDisplay: true, offers: {
    102: Object.assign({}, GOOD, { status: 'priced', amount: 61.5, fetchedAt: iso(10) }),                                    // Arsenal: exact, fresh -> a number
    101: Object.assign({}, GOOD, { status: 'link-only', fetchedAt: iso(10) }),                                               // West Ham: link, no price
    104: Object.assign({}, GOOD, { status: 'no-offers', fetchedAt: iso(10) }),                                               // Palace: provider reports no offers
    103: { match: 'ambiguous', status: 'priced', amount: 5, currency: 'EUR', fetchedAt: iso(1), url: GOOD.url },            // Charlton: quarantined
    105: Object.assign({}, GOOD, { status: 'priced', amount: 99, fetchedAt: iso(180) }),                                     // Man United: quote expired
    100000000101: Object.assign({}, GOOD, { status: 'link-only', scope: 'parent-event', fetchedAt: iso(10) }),               // tennis day: parent link only
    107: Object.assign({}, GOOD, { status: 'priced', amount: 12, fetchedAt: iso(10), url: 'https://evil.example/x' })        // hostile link
  } }, extra || {});
}

async function open(page, doc) {
  await prepare(page);
  await page.route('**/tickets/offers.json', (r) => (doc === 404 ? r.fulfill({ status: 404, body: 'no' }) : doc === 'bad' ? r.fulfill({ contentType: 'application/json', body: '{not json' }) : r.fulfill({ contentType: 'application/json', body: JSON.stringify(doc) })));
  await page.route('https://www.sportsevents365.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>provider</title>' }));
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.errors = errors;
  page.events = []; page.on('console', (m) => { if (m.type() === 'debug' && m.text().includes('[analytics]')) page.events.push(m.text()); });
  await page.goto('/index.html');
}
const card = (page, name) => page.locator('#list .ev', { hasText: name }).first();
async function openDetail(page, name) { await card(page, name).locator('.title-btn').click(); await expect(page.locator('#evDialog')).toBeVisible(); }

test.describe('P15 offer states render truthfully', () => {
  test('every state of the contract on cards and in details; nothing numeric except the exact fresh match', async ({ page }) => {
    await open(page, offers());
    await firstSearch(page, { dest: 'אנגליה' });
    await expect(card(page, 'ארסנל')).toContainText('החל מ');
    await expect(card(page, 'ארסנל')).toContainText('Sports Events 365');
    await expect(card(page, 'ווסט האם')).toContainText('מחיר אצל הספק');
    await expect(card(page, 'קריסטל')).toContainText('אין כרגע הצעות אצל הספק');
    await expect(card(page, "צ'רלטון")).not.toContainText('הספק');                                // ambiguous: no pretending
    await expect(card(page, "צ'רלטון")).not.toContainText('€');
    const prices = await page.locator('#list [data-tix="priced"]').count();
    expect(prices).toBe(1);

    await openDetail(page, 'ארסנל');
    const dlg = page.locator('#evDialog');
    await expect(dlg).toContainText('בדיקת כרטיסים אצל הספק');
    await expect(dlg).toContainText('מינימום לכרטיס אחד');
    await expect(dlg).toContainText('כולל עמלות');
    await expect(dlg).toContainText('נבדק ב');
    await expect(dlg).toContainText('עמלה');                                                      // commission disclosure next to the action
    const link = dlg.locator('a[data-link="ticket"]');
    await expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/www\.sportsevents365\.com\//);
    await page.keyboard.press('Escape');

    await openDetail(page, 'מנצ');                                                                // expired quote
    await expect(page.locator('#evDialog')).toContainText('מחיר עדכני אצל הספק');
    await expect(page.locator('#evDialog')).not.toContainText('99');
    await page.keyboard.press('Escape');

    await openDetail(page, 'וילה');                                                              // hostile link: no outbound link at all, no price
    await expect(page.locator('#evDialog a[data-link="ticket"]')).toHaveCount(0);
    await expect(page.locator('#evDialog')).not.toContainText('12');
    await expect(page.locator('#evDialog')).toContainText('לא זמין כרגע');
    await page.keyboard.press('Escape');

    await openDetail(page, "צ'רלטון");
    await expect(page.locator('#evDialog a[data-link="ticket"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(page.errors).toEqual([]);
  });

  test('a tournament day with only a parent-event link says to choose the day and shows no number', async ({ page }) => {
    await open(page, offers());
    await firstSearch(page, { dest: 'לונדון', from: '2026-10-09', to: '2026-10-09' });
    await page.locator('#list .ev', { hasText: 'סמפל' }).locator('.title-btn').first().click();
    await expect(page.locator('#evDialog')).toContainText('בדיקת כרטיסים לאירוע');
    await expect(page.locator('#evDialog')).toContainText('יש לבחור שם את היום');
    await expect(page.locator('#evDialog')).not.toContainText('€');
  });

  test('clicking the provider link is tracked with the state, opens the provider, and the trip stays intact', async ({ page }) => {
    await open(page, offers());
    await firstSearch(page);
    await card(page, 'ארסנל').locator('.add').click();
    await openDetail(page, 'ארסנל');
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#evDialog a[data-link="ticket"]').click()]);
    expect(popup.url()).toContain('sportsevents365.com');
    expect(page.events.some((e) => e.includes('ticket_link_click') && e.includes('priced'))).toBe(true);
    expect(page.events.every((e) => !e.includes('aff=') && !e.includes('61.5'))).toBe(true);   // no URL/amount in analytics
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
  });
});

test.describe('P16 ticket data is optional and can never break the product', () => {
  for (const [label, doc] of [['missing file (404)', 404], ['malformed JSON', 'bad'], ['wrong schema', { schema: 9, offers: {} }]]) {
    test(label + ': search, details, add and trip still work; no price/chip anywhere', async ({ page }) => {
      await open(page, doc);
      await firstSearch(page);
      await expect(page.locator('#list .tix-chip')).toHaveCount(0);
      await openDetail(page, 'ארסנל');
      await expect(page.locator('#evDialog')).toContainText('מידע על כרטיסים אינו זמין כרגע');
      await page.keyboard.press('Escape');
      await card(page, 'ארסנל').locator('.add').click();
      await page.click('#tab-trip');
      await expect(page.locator('.tentry')).toHaveCount(1);
      expect(page.errors).toEqual([]);
    });
  }

  test('prices OFF in the snapshot: no number is displayed even for an exact fresh match', async ({ page }) => {
    await open(page, offers({ priceDisplay: false }));
    await firstSearch(page);
    await expect(card(page, 'ארסנל')).toContainText('מחיר אצל הספק');
    await expect(page.locator('#list [data-tix="priced"]')).toHaveCount(0);
    expect(await page.locator('#list').innerText()).not.toMatch(/€|61/);
  });
});

test.describe('P18 expiry on the page itself', () => {
  test('an open page stops showing a price once the quote expires, without a reload or a CI run', async ({ page }) => {
    await open(page, offers());
    await firstSearch(page);
    await expect(card(page, 'ארסנל')).toContainText('החל מ');
    await openDetail(page, 'ארסנל');
    await expect(page.locator('#evDialog [data-tix="priced"]')).toBeVisible();
    await page.clock.setFixedTime(new Date(NOW.getTime() + 2 * 3600 * 1000));              // two hours later, same tab
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#evDialog')).toContainText('מחיר עדכני אצל הספק');
    await expect(page.locator('#evDialog [data-tix="priced"]')).toHaveCount(0);
    await expect(page.locator('#list [data-tix="priced"]')).toHaveCount(0);
    await expect(page.locator('#evDialog a[data-link="ticket"]')).toHaveCount(1);            // the verified link stays; the number does not
  });
});

test.describe('P17 trip entries carry the same truthful ticket line', () => {
  test('My trip shows the state next to the entry and the dialog opens from it', async ({ page }) => {
    await open(page, offers());
    await firstSearch(page);
    await card(page, 'ווסט האם').locator('.add').click();
    await page.click('#tab-trip');
    await expect(page.locator('.tentry', { hasText: 'ווסט האם' })).toContainText('מחיר אצל הספק');
  });
});
