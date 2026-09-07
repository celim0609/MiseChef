import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PublicComplianceFooter.tsx', import.meta.url), 'utf8');

test('shared footer keeps company, support and legal navigation without repeated contact details', () => {
  for (const route of ['/about-us', '/contact-us', '/refund-cancellation', '/payment-policy', '/pickup-policy', '/terms', '/privacy']) {
    assert.match(source, new RegExp(route.replace('/', '\\/')));
  }
  assert.match(source, /Operated by CL WISE EMPIRE/);
  assert.match(source, /Business Registration No\. 202603223516 \(003882452-K\)/);
  assert.doesNotMatch(source, /Laluan Pakatan Jaya/);
  assert.doesNotMatch(source, /016-420 9116/);
  assert.doesNotMatch(source, /misechef\.ai@gmail\.com/);
});
