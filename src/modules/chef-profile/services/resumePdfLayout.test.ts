import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeResumeHeading,
  reconstructResumePdfPage,
  type ResumePdfTextItem
} from './resumePdfLayout';

const item = (
  text: string,
  x: number,
  y: number,
  width = Math.max(12, text.length * 5),
  height = 10,
  hasEOL = false
): ResumePdfTextItem => ({ text, x, y, width, height, hasEOL });

test('reconstructs a traditional one-column resume in visual reading order', () => {
  const text = reconstructResumePdfPage([
    item('Line two', 40, 700),
    item('PROFESSIONAL SUMMARY', 40, 760, 150, 14),
    item('Line one', 40, 716),
    item('WORK EXPERIENCE', 40, 650, 130, 14),
    item('Hotel Example', 40, 620),
    item('Executive Chef', 40, 604),
    item('2020 - Present', 130, 604)
  ], 595);

  assert.ok(text.indexOf('PROFESSIONAL SUMMARY') < text.indexOf('Line one'));
  assert.ok(text.indexOf('Line one') < text.indexOf('Line two'));
  assert.match(text, /Executive Chef 2020 - Present/);
});

test('detects a two-column resume and reads the complete left column before the right', () => {
  const text = reconstructResumePdfPage([
    item('PROFILE', 30, 780, 60, 13),
    item('Left summary', 30, 750, 100),
    item('CONTACT', 30, 500, 60, 13),
    item('left@example.test', 30, 480, 120),
    item('EDUCATION', 320, 780, 80, 13),
    item('Culinary School', 320, 750, 100),
    item('LANGUAGES', 320, 500, 80, 13),
    item('English', 320, 480, 50)
  ], 595);

  assert.ok(text.indexOf('PROFILE') < text.indexOf('CONTACT'));
  assert.ok(text.indexOf('CONTACT') < text.indexOf('EDUCATION'));
  assert.ok(text.indexOf('EDUCATION') < text.indexOf('LANGUAGES'));
});

test('merges fragmented headings without altering ordinary uppercase content', () => {
  assert.equal(normalizeResumeHeading('E D U C A T I O N'), 'EDUCATION');
  assert.equal(normalizeResumeHeading('W O R K   E X P E R I E N C E'), 'WORK EXPERIENCE');
  assert.equal(normalizeResumeHeading('LANGUAGES'), 'LANGUAGES');
  assert.equal(normalizeResumeHeading('LOW WAI LEONG'), 'LOW WAI LEONG');
});

test('preserves paragraph and employment-block spacing from vertical gaps and hasEOL', () => {
  const text = reconstructResumePdfPage([
    item('WORK EXPERIENCE', 40, 780, 120, 13),
    item('First Hotel', 40, 740),
    item('Sous Chef', 40, 724),
    item('2022 - Present', 120, 724),
    item('Led service.', 40, 708),
    item('Second Restaurant', 40, 674),
    item('Chef de Partie', 40, 658),
    item('2020 - 2022', 130, 658),
    item('Managed prep.', 40, 642, 80, 10, true),
    item('Final paragraph.', 40, 626)
  ], 595);

  assert.match(text, /Led service\.\n\nSecond Restaurant/);
  assert.match(text, /Managed prep\.\nFinal paragraph\./);
});

test('repairs a date boundary fused inside one PDF text item', () => {
  const text = reconstructResumePdfPage([
    item('Owner & Head Chef (Malaysia)November 2025 - May 2026', 40, 700, 300)
  ], 595);

  assert.equal(text, 'Owner & Head Chef (Malaysia) November 2025 - May 2026');
});
