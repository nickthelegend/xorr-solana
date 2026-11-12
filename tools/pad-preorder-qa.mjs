// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Nivesh Gajengi
// Capture the real local landing site. Never submit a payment or fabricate backers.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:4319');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'QA requires a loopback preview');
const output = fileURLToPath(new URL('../docs/pad/screenshots/', import.meta.url));
await mkdir(output, { recursive: true });
const report = { checkedAt: new Date().toISOString(), origin: origin.origin, captures: [], pageErrors: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push({ width, message: error.message }));
    const config = await (await context.request.get(new URL('/api/pad/preorder', origin).href)).json();
    assert.equal(config.cluster, 'devnet', 'Capture requires an explicitly configured devnet preview');
    const response = await page.goto(new URL('/pad', origin).href, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    // Visit every section so the site's existing viewport reveals have settled.
    for (let y = 0; y < await page.locator('body').evaluate(el => el.scrollHeight); y += 800) {
      await page.evaluate(top => window.scrollTo(0, top), y);
      await page.waitForTimeout(80);
    }
    await page.evaluate(() => document.fonts.ready);

    async function capture(name, target) {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const dialog = document.querySelector('dialog[open]');
        return { viewport: innerWidth, documentWidth: root.scrollWidth, clientWidth: root.clientWidth,
          dialogWidth: dialog?.clientWidth ?? null, dialogScrollWidth: dialog?.scrollWidth ?? null };
      });
      assert.ok(metrics.documentWidth <= metrics.clientWidth, `${name}: document horizontal overflow`);
      if (metrics.dialogWidth !== null) assert.ok(metrics.dialogScrollWidth <= metrics.dialogWidth, `${name}: dialog horizontal overflow`);
      const file = `preorder-s4-final-${name}-${width}.png`;
      if (await dialogVisible()) {
        await page.screenshot({ path: `${output}${file}`, animations: 'disabled' });
      } else {
        const bounds = await target.boundingBox();
        const top = await page.evaluate(() => scrollY);
        await page.screenshot({ path: `${output}${file}`, animations: 'disabled', fullPage: true,
          clip: { x: 0, y: Math.max(0, bounds.y + top), width, height: Math.ceil(bounds.height) } });
      }
      report.captures.push({ file, ...metrics });
    }
    async function dialogVisible() { return page.locator('dialog[open]').count(); }

    assert.equal(await page.locator('#models input[type=radio]').count(), 4);
    await capture('models', page.locator('#models'));
    // Exercise all four real model/build choices without creating any order.
    for (const selection of ['core-diy', 'core-assembled', 'pro-diy', 'pro-assembled']) {
      await page.locator(`#models input[value="${selection}"]`).check();
      await page.getByRole('button', { name: `Reserve with $${selection.startsWith('core') ? 20 : 30} deposit`, exact: true }).waitFor();
    }
    await page.getByRole('button', { name: 'Reserve with $30 deposit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email for shipping updates').waitFor();
    await capture('sheet', dialog);
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await capture('sheet-bottom', dialog);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Reserve with $30 deposit', exact: true }).waitFor({ state: 'visible' });
    await capture('strip', page.locator('#backers'));
    await page.getByRole('link', { name: 'View the backers wall', exact: true }).click();
    await page.waitForURL(new URL('/pad/backers', origin).href);
    await page.getByRole('heading', { name: 'Be the first backer', exact: true }).waitFor();
    await capture('wall', page.locator('body'));
    await context.close();
  }
  assert.deepEqual(report.pageErrors, [], 'Browser exceptions occurred');
  await writeFile(`${output}preorder-s4-final-qa.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Captured ${report.captures.length} screenshots; no horizontal overflow or browser exceptions.`);
} finally {
  await browser.close();
}
