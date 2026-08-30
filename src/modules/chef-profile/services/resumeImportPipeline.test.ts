import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumeImportError, getFirebaseErrorDetails } from './resumeImportErrors';
import { runResumeImportPipeline } from './resumeImportPipeline';

test('successful upload registers metadata before extraction and parsing', async () => {
  const events: string[] = [];
  let timingCallbackCalled = false;
  const pipeline = await runResumeImportPipeline({
    upload: async () => { events.push('upload'); },
    register: async () => { events.push('metadata'); },
    extract: async () => { events.push('extract'); return 'resume text'; },
    parse: async text => { events.push(`parse:${text}`); return { fullName: 'Chef Test' }; },
    cleanup: async () => { events.push('cleanup'); },
    onStage: stage => { events.push(`stage:${stage}`); },
    onTiming: () => { timingCallbackCalled = true; }
  });
  assert.deepEqual(events, ['stage:1', 'upload', 'metadata', 'stage:2', 'extract', 'stage:3', 'parse:resume text']);
  assert.deepEqual(pipeline.result, { fullName: 'Chef Test' });
  assert.equal(pipeline.registeredForRetry, true);
  assert.equal(timingCallbackCalled, true);
  assert.ok(pipeline.timings.uploadMs >= 0);
  assert.ok(pipeline.timings.metadataMs >= 0);
  assert.ok(pipeline.timings.pdfExtractionMs >= 0);
  assert.ok(pipeline.timings.jobCreationMs >= 0);
});

test('Storage failure preserves upload stage/code and never extracts or parses', async () => {
  const original = Object.assign(new Error('User does not have permission.'), {
    code: 'storage/unauthorized', status_: 403, serverResponse_: '{"error":{"code":403}}'
  });
  let extracted = false;
  let parsed = false;
  let cleaned = false;
  await assert.rejects(runResumeImportPipeline({
    upload: async () => { throw original; },
    register: async () => undefined,
    extract: async () => { extracted = true; return ''; },
    parse: async () => { parsed = true; },
    cleanup: async () => { cleaned = true; },
    onStage: () => undefined
  }), error => (
    error instanceof ResumeImportError
    && error.code === 'upload_failed'
    && error.stage === 'upload'
    && error.cause === original
  ));
  assert.equal(extracted, false);
  assert.equal(parsed, false);
  assert.equal(cleaned, true);
  assert.deepEqual(getFirebaseErrorDetails(original), {
    firebaseCode: 'storage/unauthorized',
    firebaseMessage: 'User does not have permission.',
    serverResponse: '{"error":{"code":403}}',
    httpStatus: 403
  });
});

test('metadata registration failure is not classified as a Storage upload failure', async () => {
  await assert.rejects(runResumeImportPipeline({
    upload: async () => undefined,
    register: async () => { throw Object.assign(new Error('Permission denied'), { code: 'permission-denied' }); },
    extract: async () => 'unused',
    parse: async () => undefined,
    cleanup: async () => undefined,
    onStage: () => undefined
  }), error => error instanceof ResumeImportError
    && error.code === 'upload_registration_failed'
    && error.stage === 'metadata');
});

test('retry succeeds after a prior upload failure', async () => {
  let attempts = 0;
  const execute = () => runResumeImportPipeline({
    upload: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary upload failure');
    },
    register: async () => undefined,
    extract: async () => 'valid resume',
    parse: async text => text.toUpperCase(),
    cleanup: async () => undefined,
    onStage: () => undefined
  });
  await assert.rejects(execute(), ResumeImportError);
  assert.equal((await execute()).result, 'VALID RESUME');
});
