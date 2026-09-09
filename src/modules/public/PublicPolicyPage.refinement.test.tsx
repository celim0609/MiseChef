import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PublicPolicyPage.tsx', import.meta.url), 'utf8');

test('public policy copy keeps currency market-aware', () => {
  assert.match(source, /currency applicable to the relevant Store, market or transaction/);
  assert.doesNotMatch(source, /All prices are stated in Malaysian Ringgit/);
});

test('refund policy separates subscriptions from Store Orders', () => {
  assert.match(source, /Subscriptions & Digital Services/);
  assert.match(source, /Cancelling a subscription does not automatically entitle the subscriber to a refund/);
});

test('support copy routes customers to Contact Us and WhatsApp', () => {
  assert.match(source, /href="\/contact-us"/);
  assert.match(source, /href="https:\/\/wa\.me\/60164209116"/);
  assert.doesNotMatch(source, /Phone\/WhatsApp/);
});
