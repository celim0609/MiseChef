import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeImportPrompt } from './resumeImportPrompt.js';

test('resume prompt relies on the response schema without repeating a JSON template', () => {
  const prompt = buildResumeImportPrompt('CHEF TEST\nEXPERIENCE\nChef | Hotel | 2020 - Present');
  assert.match(prompt, /Extract every distinct job/);
  assert.match(prompt, /unsupported sections in unmappedSections/);
  assert.match(prompt, /never guess dates/);
  assert.match(prompt, /CHEF TEST/);
  assert.doesNotMatch(prompt, /"basicProfile"/);
  assert.ok(prompt.length < 1_500);
});
