import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  authorizePersonalResumeImportJob,
  claimPersonalResumeImportJob,
  getResumeImportClientJobPath,
  getResumeImportJobError,
  RESUME_IMPORT_TIMEOUT_MESSAGE,
  ResumeImportTimeoutError,
  withResumeImportTimeout
} from './resumeImportJob.js';

test('authenticated Personal owners are authorized without a Business entitlement', () => {
  assert.deepEqual(
    authorizePersonalResumeImportJob({ requesterId: 'chef-123', personalScopeId: 'chef-123' }),
    { userId: 'chef-123' }
  );
});

test('Personal Resume Import rejects missing authentication and cross-owner jobs', () => {
  assert.throws(
    () => authorizePersonalResumeImportJob({ requesterId: '', personalScopeId: '' }),
    error => error.code === 'unauthenticated'
      && error.details?.reason === 'personal-resume-authentication-required'
  );
  assert.throws(
    () => authorizePersonalResumeImportJob({ requesterId: 'alice', personalScopeId: 'bob' }),
    error => error.code === 'permission-denied'
      && error.details?.reason === 'personal-resume-owner-mismatch'
  );
});

test('the same Personal Resume Import job can be claimed only once', async () => {
  let status = 'pending';
  let clientStatus = 'pending';
  const jobReference = { path: 'resumeImportJobs/job-1' };
  const clientJobReference = { path: 'users/alice/resumeImportJobs/job-1' };
  const db = {
    runTransaction: async operation => operation({
      get: async reference => ({
        exists: reference === jobReference,
        data: () => ({ status })
      }),
      set: (reference, value) => {
        if (reference === jobReference) status = value.status;
        if (reference === clientJobReference) clientStatus = value.status;
      }
    })
  };

  assert.equal(await claimPersonalResumeImportJob({
    db,
    jobReference,
    clientJobReference,
    requesterId: 'alice',
    updatedAt: 'server-time'
  }), true);
  assert.equal(status, 'processing');
  assert.equal(clientStatus, 'processing');
  assert.equal(await claimPersonalResumeImportJob({
    db,
    jobReference,
    clientJobReference,
    requesterId: 'alice',
    updatedAt: 'server-time-2'
  }), false);
});

test('resume import timeout rejects with the specific retry message', async () => {
  await assert.rejects(
    withResumeImportTimeout(() => new Promise(() => undefined), 5),
    error => error instanceof ResumeImportTimeoutError
      && error.message === RESUME_IMPORT_TIMEOUT_MESSAGE
  );
});

test('resume import timeout clears when analysis succeeds', async () => {
  assert.deepEqual(await withResumeImportTimeout(async () => ({ ok: true }), 50), { ok: true });
});

test('resume job failures keep safe actionable messages', () => {
  assert.equal(getResumeImportJobError(new ResumeImportTimeoutError()), RESUME_IMPORT_TIMEOUT_MESSAGE);
  assert.equal(
    getResumeImportJobError({ code: 'resource-exhausted', message: 'Your workspace AI limit was reached.' }),
    'Your workspace AI limit was reached.'
  );
  assert.equal(
    getResumeImportJobError({
      code: 'permission-denied',
      message: 'You can only process your own Resume Import.',
      details: { reason: 'personal-resume-owner-mismatch' }
    }),
    'You can only process your own Resume Import.'
  );
  assert.equal(getResumeImportJobError(new Error('provider credentials leaked')), 'AI analysis failed. Please retry.');
});

test('client job state stays in the existing owner-scoped Firestore path', () => {
  assert.equal(
    getResumeImportClientJobPath('chef-123', 'job-456'),
    'users/chef-123/resumeImportJobs/job-456'
  );
});

test('the callable enqueues and returns before the background Gemini processor', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const callable = source.slice(
    source.indexOf('export const parseResumeToPortfolio ='),
    source.indexOf('export const processResumeImportJob =')
  );
  const processor = source.slice(source.indexOf('export const processResumeImportJob ='));

  assert.match(callable, /collection\('resumeImportJobs'\)\.doc\(\)/);
  assert.match(callable, /requireAuthenticatedUser\(request\)/);
  assert.match(callable, /workspaceId:\s*requesterId/);
  assert.doesNotMatch(callable, /request\.data\?\.workspaceId/);
  assert.match(callable, /return \{ jobId: jobReference\.id \}/);
  assert.doesNotMatch(callable, /generateContent/);
  assert.match(processor, /authorizePersonalResumeImportJob/);
  assert.match(processor, /reservePersonalResumeImportUsage/);
  assert.match(processor, /const claimed = await claimPersonalResumeImportJob/);
  assert.match(processor, /if \(!claimed\) return/);
  assert.doesNotMatch(processor, /requireWorkspaceEntitlements/);
  assert.ok(processor.indexOf('reservePersonalResumeImportUsage') < processor.indexOf('ai.models.generateContent'));
  assert.match(processor, /withResumeImportTimeout/);
  assert.match(processor, /thinkingConfig: \{ thinkingBudget: 0 \}/);
  assert.match(processor, /model: RESUME_MODEL/);
  assert.match(processor, /httpOptions: \{ timeout: RESUME_GEMINI_REQUEST_TIMEOUT_MS \}/);
  assert.doesNotMatch(processor, /callGeminiWithRetry\(\(\) => ai\.models\.generateContent/);
  assert.match(processor, /AI resume import timings/);
  assert.match(processor, /status: 'done'/);
  assert.match(processor, /status: 'failed'/);
  assert.match(processor, /releaseMonthlySubscriptionUsage\(\{ db, reservation: usageReservation \}\)/);
  assert.doesNotMatch(processor, /chefProfiles/);
});
