import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reserveMonthlySubscriptionUsage } from './subscriptionEnforcement.js';

const createUsageDb = initialUsage => {
  let usage = { ...initialUsage };
  const usageReference = {
    get: async () => ({ exists: true, data: () => ({ ...usage }) })
  };

  return {
    db: {
      collection: name => {
        assert.equal(name, 'subscriptionUsage');
        return { doc: () => usageReference };
      },
      runTransaction: async callback => callback({
        get: async () => ({ exists: true, data: () => ({ ...usage }) }),
        set: (_reference, next) => { usage = { ...usage, ...next }; }
      })
    },
    getUsage: () => usage
  };
};

test('personal expense OCR usage is tracked without consuming supplier invoice OCR quota', async () => {
  const fixture = createUsageDb({ aiRequests: 20, invoiceOcr: 9, personalExpenseOcr: 0 });
  const entitlements = {
    workspaceId: 'workspace-1',
    limits: { aiRequests: 100, invoiceOcr: 10 }
  };

  await reserveMonthlySubscriptionUsage({
    db: fixture.db,
    entitlements,
    increments: { aiRequests: 1, personalExpenseOcr: 1 }
  });

  assert.equal(fixture.getUsage().aiRequests, 21);
  assert.equal(fixture.getUsage().personalExpenseOcr, 1);
  assert.equal(fixture.getUsage().invoiceOcr, 9);

  await reserveMonthlySubscriptionUsage({
    db: fixture.db,
    entitlements,
    increments: { aiRequests: 1, invoiceOcr: 1 }
  });

  assert.equal(fixture.getUsage().invoiceOcr, 10);
});

test('callable reservations keep personal and supplier OCR counters independent', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const supplierCallable = source.slice(
    source.indexOf('export const parseInvoiceToJson'),
    source.indexOf('export const extractPersonalExpenseReceipt')
  );
  const personalCallable = source.slice(
    source.indexOf('export const extractPersonalExpenseReceipt'),
    source.indexOf('export const recordPersonalExpenseSettlement')
  );

  assert.match(supplierCallable, /increments:\s*\{ aiRequests: 1, invoiceOcr: 1 \}/);
  assert.doesNotMatch(supplierCallable, /personalExpenseOcr/);
  assert.match(personalCallable, /increments:\s*\{ aiRequests: 1, personalExpenseOcr: 1 \}/);
  assert.doesNotMatch(personalCallable, /increments:\s*\{[^}]*invoiceOcr/);
});

test('personal expense receipt extraction is authenticated, path-bound, and size-limited', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const personalCallable = source.slice(
    source.indexOf('export const extractPersonalExpenseReceipt'),
    source.indexOf('export const recordPersonalExpenseSettlement')
  );

  assert.match(personalCallable, /requireAuthenticatedUser\(request\)/);
  assert.match(personalCallable, /personal-expenses\/\$\{workspaceId\}\/\$\{requesterId\}\//);
  assert.match(personalCallable, /requireWorkspaceEntitlements/);
  assert.match(personalCallable, /ALLOWED_INVOICE_OCR_MIME_TYPES\.has\(mimeType\)/);
  assert.match(personalCallable, /fileBuffer\.length > MAX_INVOICE_OCR_BYTES/);
});
