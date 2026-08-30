import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResumeImportJobPath,
  normalizeResumeImportJob,
  RESUME_IMPORT_SLOW_MESSAGE
} from './resumeImportJobsModel';

test('resume import jobs use the existing owner-scoped listener path', () => {
  assert.equal(
    getResumeImportJobPath('chef-123', 'job-456'),
    'users/chef-123/resumeImportJobs/job-456'
  );
});

test('failed resume jobs preserve the specific backend error', () => {
  assert.deepEqual(normalizeResumeImportJob({
    status: 'failed',
    error: 'AI analysis timed out, please retry'
  }), {
    status: 'failed',
    error: 'AI analysis timed out, please retry'
  });
});

test('completed resume jobs expose normalized result data', () => {
  const job = normalizeResumeImportJob({
    status: 'done',
    result: { basicProfile: { fullName: 'Chef Test' }, skills: [{ name: 'Pastry' }] }
  });
  assert.equal(job.status, 'done');
  assert.equal(job.result?.basicProfile.fullName, 'Chef Test');
  assert.equal(job.result?.skills[0]?.name, 'Pastry');
});

test('completed resume jobs expose backend stage timings', () => {
  const job = normalizeResumeImportJob({
    status: 'done',
    result: {},
    timings: {
      functionStartupMs: 120,
      preGeminiMs: 300,
      geminiResponseMs: 4800,
      jsonParsingMs: 1,
      resultPublishMs: 80,
      totalFunctionMs: 5221
    }
  });
  assert.equal(job.timings?.geminiResponseMs, 4800);
  assert.equal(job.timings?.jsonParsingMs, 1);
});

test('the frontend fallback timeout has the requested non-blocking message', () => {
  assert.equal(RESUME_IMPORT_SLOW_MESSAGE, 'This is taking longer than expected, you can check back later');
});
