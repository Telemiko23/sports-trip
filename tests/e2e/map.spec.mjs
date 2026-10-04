import { test, expect } from '@playwright/test';
import { open, firstSearch } from './helpers.mjs';

test.describe('map (P07 map part)', () => {
  test('a pin inspects events without changing the destination; adding keeps the map still; «חיפוש סביב המקום הזה» is explicit', async ({ page }) => {
    await open(page);
    await page.fill('#obDest', 'אנגליה'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.fill('#obFrom', '2026-10-09'); await page.fill('#obTo', '2026-10-11'); await page.click('#obGo');
    await page.waitForSelector('#list .ev');
    const ctxBefore = await page.locator('#ctxBar').innerText();
    await page.click('.viewsw [data-mode="map"]');
    await page.waitForSelector('.leaflet-marker-icon');
    expect(await page.locator('.leaflet-marker-icon').count()).toBeGreaterThan(2);
    const manchester = page.locator('.leaflet-marker-icon[title*="Old Trafford"]');
    await manchester.click();
    await expect(page.locator('#mapPanel')).toContainText('Old Trafford');
    await expect(page.locator('#mapPanel')).toContainText("מנצ'סטר יונייטד");
    expect(await page.locator('#ctxBar').innerText()).toBe(ctxBefore);                        // inspecting a pin never re-scopes the search
    const rel = async () => { const m = await page.locator('.leaflet-marker-icon[title*="Old Trafford"]').boundingBox(); const a = await page.locator('#map').boundingBox(); return { x: m.x - a.x, y: m.y - a.y }; };
    await page.waitForTimeout(700);                                                                // let the smooth scroll to the panel settle
    const box0 = await rel();
    await page.locator('#mapPanel .add').first().click();
    await expect(page.locator('#mapPanel .ev.picked')).toHaveCount(1);
    await expect(page.locator('#mapPanel')).toContainText('Old Trafford');                    // panel stays open
    await page.waitForTimeout(300);
    const box1 = await rel();
    expect(Math.abs(box0.x - box1.x) + Math.abs(box0.y - box1.y)).toBeLessThan(2);            // the map did not move
    await page.click('#mapPanel [data-act="search-here"]');                                    // the explicit action
    await expect(page.locator('#ctxBar')).toContainText("מנצ'סטר");
    await expect(page.locator('#ctxBar')).toContainText('150 ק״מ');
  });

  test('an event without a venue pin is drawn as an approximate city marker, labelled as such', async ({ page }) => {
    await open(page);
    await firstSearch(page, { dest: 'לונדון', from: '2026-10-10', to: '2026-10-10' });
    await page.click('.viewsw [data-mode="map"]');
    await page.waitForSelector('.leaflet-marker-icon');
    await expect(page.locator('.leaflet-marker-icon .map-pin.approx')).toHaveCount(1);        // the darts night has only a city point
    await page.locator('.leaflet-marker-icon:has(.map-pin.approx)').focus();            // pins are keyboard-operable (pointer overlap with a stadium pin is possible)
    await page.keyboard.press('Enter');
    await expect(page.locator('#mapPanel')).toContainText('מיקום משוער');
  });
});
