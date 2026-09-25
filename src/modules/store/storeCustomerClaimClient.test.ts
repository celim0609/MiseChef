import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('./services/paymentService.ts', import.meta.url), 'utf8');

test('a dismissed Google popup keeps the claim and does not use redirect fallback', () => {
  assert.match(page, /if \(code === 'auth\/popup-blocked'\) \{/);
  assert.doesNotMatch(page, /popup-blocked' \|\| code === 'auth\/popup-closed-by-user/);
  assert.match(page, /Google sign-in was not completed\. Your order is still available to save\./);
});

test('a blocked popup may fall back to redirect while preserving the Store claim envelope', () => {
  assert.match(page, /if \(code === 'auth\/popup-blocked'\)[\s\S]*signInWithRedirect/);
  assert.ok(page.indexOf('setClaimEnvelope(claimableGuestOrder)') < page.indexOf('signInWithPopup(auth, provider)'));
});

test('claim failures retain the transient claim and success removes only its matching recovery credential', () => {
  assert.match(app, /\.catch\(\(\) => \{[\s\S]*not saved yet\. Please reload and try again/);
  assert.ok(app.indexOf('clearStoreCustomerSession();') < app.indexOf('window.location.replace(`/orders?claimed='));
  assert.match(app, /recovery\.paymentSessionId === claimEnvelope\.paymentSessionId[\s\S]*recovery\.checkoutAccessToken === claimEnvelope\.checkoutAccessToken/);
});

test('client claim input cannot carry or override a customer UID', () => {
  assert.match(service, /Pick<StoreClaimEnvelope, 'slug' \| 'provider' \| 'paymentSessionId' \| 'checkoutAccessToken'>/);
  assert.doesNotMatch(service, /customerUid/);
});

test('Store customer paths skip Professional provisioning and explicit app entry retains it', () => {
  assert.match(app, /hasStoreClaim\(\) \|\| !isAppPath\(window\.location\.pathname\)/);
  assert.match(app, /await ensureNewUserProvisioned\(currentUser\)/);
});
