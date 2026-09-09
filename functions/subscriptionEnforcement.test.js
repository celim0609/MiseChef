import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT,
  releaseMonthlySubscriptionUsage,
  reserveMonthlySubscriptionUsage,
  reservePersonalResumeImportUsage
} from './subscriptionEnforcement.js';

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
        set: (_reference, next) => { usage = { ...usage, ...next }; },
        update: (_reference, next) => { usage = { ...usage, ...next }; }
      })
    },
    getUsage: () => usage
  };
};

test('Personal Resume Import uses an isolated bounded counter and releases failed reservations', async () => {
  const fixture = createUsageDb({ aiRequests: 7, personalResumeImports: 0 });
  const reservation = await reservePersonalResumeImportUsage({ db: fixture.db, userId: 'personal-user' });

  assert.equal(fixture.getUsage().personalResumeImports, 1);
  assert.equal(fixture.getUsage().aiRequests, 7);
  assert.deepEqual(reservation.increments, { personalResumeImports: 1 });

  await releaseMonthlySubscriptionUsage({ db: fixture.db, reservation });
  assert.equal(fixture.getUsage().personalResumeImports, 0);
  assert.equal(fixture.getUsage().aiRequests, 7);
});

test('successful Personal Resume Imports consume exactly one internal safety-limit unit', async () => {
  const fixture = createUsageDb({
    aiRequests: 0,
    personalResumeImports: PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT - 1
  });

  await reservePersonalResumeImportUsage({ db: fixture.db, userId: 'personal-user' });
  assert.equal(fixture.getUsage().personalResumeImports, PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT);

  await assert.rejects(
    reservePersonalResumeImportUsage({ db: fixture.db, userId: 'personal-user' }),
    error => error.code === 'resource-exhausted'
      && error.details?.reason === 'personal-resume-import-limit-reached'
      && !error.message.includes(String(PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT))
  );
});

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

test('Business AI authorization remains bound to the generic Workspace aiRequests feature', async () => {
  const source = await readFile(new URL('./subscriptionEnforcement.js', import.meta.url), 'utf8');
  const authorization = source.slice(
    source.indexOf('export const requireWorkspaceEntitlements'),
    source.indexOf('const loadMonthlyUsageBaseline')
  );

  assert.match(authorization, /requireWorkspaceFeature\(\{ db, uid, workspaceId, feature: 'aiRequests' \}\)/);
  assert.doesNotMatch(authorization, /personalResumeImports/);
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
