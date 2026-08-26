import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getResumeImportClientJobPath,
  getResumeImportJobError,
  RESUME_IMPORT_TIMEOUT_MESSAGE,
  ResumeImportTimeoutError,
  withResumeImportTimeout
} from './resumeImportJob.js';

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
  assert.match(callable, /return \{ jobId: jobReference\.id \}/);
  assert.doesNotMatch(callable, /generateContent/);
  assert.match(processor, /withResumeImportTimeout/);
  assert.match(processor, /thinkingConfig: \{ thinkingBudget: 0 \}/);
  assert.match(processor, /model: RESUME_MODEL/);
  assert.match(processor, /httpOptions: \{ timeout: RESUME_GEMINI_REQUEST_TIMEOUT_MS \}/);
  assert.doesNotMatch(processor, /callGeminiWithRetry\(\(\) => ai\.models\.generateContent/);
  assert.match(processor, /AI resume import timings/);
  assert.match(processor, /status: 'done'/);
  assert.match(processor, /status: 'failed'/);
});
