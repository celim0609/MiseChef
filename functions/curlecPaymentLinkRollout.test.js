import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isCurlecPaymentLinkRolloutEnabled } from './paymentProviders/curlecPaymentLinkRollout.js';

test('Curlec Payment Link rollout is default-deny and Beta opts in explicitly', () => {
  assert.equal(isCurlecPaymentLinkRolloutEnabled(undefined), false);
  assert.equal(isCurlecPaymentLinkRolloutEnabled('false'), false);
  assert.equal(isCurlecPaymentLinkRolloutEnabled('true'), true);
  const betaFunctionsEnvironment = readFileSync(new URL('./.env.misechef-beta-fa4bf', import.meta.url), 'utf8');
  assert.match(betaFunctionsEnvironment, /^CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED=true$/m);
  const productionEnvironment = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(productionEnvironment, /^CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED=false$/m);
  const functionsIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(functionsIndex, /defineString\('CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED', \{ default: 'false' \}\)/);
  assert.match(functionsIndex, /isCurlecPaymentLinkRolloutEnabled\(curlecPaymentLinkRolloutEnabled\.value\(\)\)/);
});
