import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiFailure, generateGeminiJsonWithRetry } from './geminiReliability.js';

const invalidJson = () => {
  const error = new Error('AI returned invalid JSON.');
  error.details = { reason: 'invalid-json' };
  throw error;
};

test('HTTP 503 retries three times with exponential backoff', async () => {
  let calls = 0;
  const delays = [];
  const failures = [];
  const result = await generateGeminiJsonWithRetry({
    generate: async () => {
      calls += 1;
      if (calls <= 3) throw Object.assign(new Error('503 UNAVAILABLE'), { status: 503 });
      return { text: '{"ok":true}' };
    },
    parse: JSON.parse,
    sleep: async delay => delays.push(delay),
    onFailure: failure => failures.push(failure.type)
  });
  assert.equal(result.attempts, 4);
  assert.deepEqual(delays, [500, 1000, 2000]);
  assert.deepEqual(failures, ['http_failure', 'http_failure', 'http_failure']);
});

test('HTTP 429 is retried automatically', async () => {
  let calls = 0;
  const result = await generateGeminiJsonWithRetry({
    generate: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return { text: '{"ok":true}' };
    },
    parse: JSON.parse,
    sleep: async () => undefined
  });
  assert.equal(result.attempts, 2);
});

test('HTTP retries stop after three backoff retries', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(generateGeminiJsonWithRetry({
    generate: async () => {
      calls += 1;
      throw Object.assign(new Error('503 UNAVAILABLE'), { status: 503 });
    },
    parse: JSON.parse,
    sleep: async delay => delays.push(delay)
  }), /503/);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [500, 1000, 2000]);
});

test('invalid JSON is rejected immediately and retried once', async () => {
  let calls = 0;
  const failures = [];
  const result = await generateGeminiJsonWithRetry({
    generate: async () => ({ text: ++calls === 1 ? 'not json' : '{"ok":true}' }),
    parse: text => text === 'not json' ? invalidJson() : JSON.parse(text),
    onFailure: failure => failures.push(failure.type)
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(failures, ['json_parsing_failure']);
});

test('a second invalid JSON response fails without a third JSON attempt', async () => {
  let calls = 0;
  await assert.rejects(generateGeminiJsonWithRetry({
    generate: async () => { calls += 1; return { text: 'not json' }; },
    parse: invalidJson
  }), /invalid JSON/i);
  assert.equal(calls, 2);
});

test('timeout and model refusal are classified and not retried', async () => {
  assert.deepEqual(classifyGeminiFailure(Object.assign(new Error('deadline exceeded'), { code: 'deadline-exceeded' })), { type: 'timeout', status: 0 });
  const failures = [];
  let timeoutCalls = 0;
  await assert.rejects(generateGeminiJsonWithRetry({
    generate: async () => {
      timeoutCalls += 1;
      throw Object.assign(new Error('deadline exceeded'), { code: 'deadline-exceeded' });
    },
    parse: JSON.parse,
    onFailure: failure => failures.push(failure.type)
  }), /deadline/i);
  assert.equal(timeoutCalls, 1);
  await assert.rejects(generateGeminiJsonWithRetry({
    generate: async () => ({ text: '', candidates: [{ finishReason: 'SAFETY' }] }),
    parse: JSON.parse,
    onFailure: failure => failures.push(failure.type)
  }), /refused/i);
  assert.deepEqual(failures, ['timeout', 'model_refusal']);
});
