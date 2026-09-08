import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurlecPrefill, normalizeCurlecContact } from './curlecClientAdapter';

test('normalizes Malaysian Curlec contacts without changing stored-order input', () => {
  assert.equal(normalizeCurlecContact('0123456789'), '+60123456789');
  assert.equal(normalizeCurlecContact('60123456789'), '+60123456789');
  assert.equal(normalizeCurlecContact('+60123456789'), '+60123456789');
});

test('leaves non-Malaysian or unrecognized contacts unchanged', () => {
  assert.equal(normalizeCurlecContact('+14155552671'), '+14155552671');
  assert.equal(normalizeCurlecContact('not-a-phone'), 'not-a-phone');
});

test('passes an existing email to Curlec prefill without making it required', () => {
  assert.deepEqual(getCurlecPrefill('Celim', '0123456789', 'celim@example.com'), {
    name: 'Celim', contact: '+60123456789', email: 'celim@example.com'
  });
  assert.deepEqual(getCurlecPrefill('Celim', '0123456789', '  '), {
    name: 'Celim', contact: '+60123456789'
  });
});
