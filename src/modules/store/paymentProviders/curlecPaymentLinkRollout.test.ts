import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldUseCurlecPaymentLink } from './curlecPaymentLinkRollout';

test('client Payment Link gate enables only Meta Curlec checkout after explicit rollout opt-in', () => {
  assert.equal(shouldUseCurlecPaymentLink({ paymentMethodId: 'curlec', isMetaInAppBrowser: true, rolloutEnabled: true }), true);
  assert.equal(shouldUseCurlecPaymentLink({ paymentMethodId: 'curlec', isMetaInAppBrowser: true, rolloutEnabled: false }), false);
  assert.equal(shouldUseCurlecPaymentLink({ paymentMethodId: 'stripe', isMetaInAppBrowser: true, rolloutEnabled: true }), false);
  assert.equal(shouldUseCurlecPaymentLink({ paymentMethodId: 'curlec', isMetaInAppBrowser: false, rolloutEnabled: true }), false);
});

test('Beta opts in and Production remains default-off with the same rollout setting name', () => {
  const betaEnvironment = readFileSync(new URL('../../../../.env.beta', import.meta.url), 'utf8');
  const defaults = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
  assert.match(betaEnvironment, /^VITE_CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED=true$/m);
  assert.match(defaults, /^VITE_CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED=false$/m);
});
