import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { seed } from './fixture.mjs';

const { chromium } = createRequire(join(process.env.QA_TOOLS, 'package.json'))('playwright');
const origin = 'http://127.0.0.1:5179';
const app = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], {
  env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_API_KEY: 'demo-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-misechef-preview.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'demo-misechef-preview',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-misechef-preview.appspot.com', VITE_FIREBASE_MESSAGING_SENDER_ID: 'demo',
    VITE_FIREBASE_APP_ID: 'demo-app' },
  stdio: 'ignore'
});
const report = { candidate: process.env.QA_SHA, checks: [] };
let browser;
try {
  await seed();
  const url = `${origin}/${basename(process.env.QA_ENTRY)}/index.html`;
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(url).then(response => response.ok, () => false);
    if (ready) break;
    if (attempt === 59 || app.exitCode !== null) throw new Error('Local app did not start');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || undefined });
  for (const [account, role] of [['owner', 'Owner'], ['manager', 'Manager']]) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      try {
        // Allow only the local page, Auth, Firestore and the read-only QA callable.
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          const local = ['5179', '8080', '9099'].includes(url.port);
          const qaCallable = url.port === '5001' && url.pathname === '/demo-misechef-preview/us-central1/verifyQaSession';
          return url.hostname === '127.0.0.1' && (local || qaCallable)
            ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(`${url}?account=${account}`);
        assert.equal(await page.getByTestId('qa-role').innerText(), role);
        await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
        for (const [reference, signature, remark] of [
          ['QA-POS-001', '*MiseChef | GG Grab&Go*', 'Ring the bell'],
          ['QA-ONLINE-001', '*Synthetic Kitchen*\nPowered by MiseChef', 'Pack separately']
        ]) {
          await page.getByRole('button', { name: new RegExp(reference) }).click();
          const totals = page.locator('dl[aria-label="Order totals"]');
          const amounts = await totals.innerText();
          assert.equal(amounts.match(/RM12\.60/g)?.length, 5);
          assert.match(amounts, /Total Delivery Fee\s+RM63\.00/);
          assert.match(amounts, /Final Total\s+RM123\.00/);
          await page.getByRole('button', { name: 'Confirm Order', exact: true }).click();
          const draft = page.getByRole('textbox', { name: 'WhatsApp Preview' });
          const message = await draft.inputValue();
          assert.equal(message.match(/Delivery Fee: MYR 12\.60/g)?.length, 5);
          assert.match(message, /Total Delivery Fee: MYR 63\.00/);
          assert.match(message, /Final Total: MYR 123\.00/);
          assert.match(message, /✅ \*Order Confirmation\*/);
          assert.ok(message.includes(remark) && message.endsWith(signature));
          assert.equal(message.includes('No onions'), reference === 'QA-ONLINE-001');
          assert.ok(!message.includes('Internal QA note'));
          const evidencePrefix = join(process.env.QA_EVIDENCE, `${account}-${width}-${reference}`);
          await totals.screenshot({ path: `${evidencePrefix}-totals.png` });
          await draft.screenshot({ path: `${evidencePrefix}-draft.png` });
          const edited = `${message}\nSynthetic edit.`;
          await draft.fill(edited);
          const link = new URL(await page.getByRole('link', { name: 'Open WhatsApp' }).getAttribute('href'));
          assert.equal(link.searchParams.get('text'), edited);
          assert.equal(link.searchParams.get('phone'), '60123456789');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.getByRole('button', { name: 'Close preview' }).click();
          report.checks.push({ role, width, reference, result: 'pass' });
        }
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  report.result = 'fail';
  throw error;
} finally {
  report.result ??= 'pass';
  try {
    await writeFile(join(process.env.QA_EVIDENCE, 'results.json'), JSON.stringify(report, null, 2));
    await browser?.close();
  } finally {
    app.kill();
  }
}
