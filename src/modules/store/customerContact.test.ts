import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const contactService = readFileSync(new URL('./services/customerContactService.ts', import.meta.url), 'utf8');
const paymentCore = readFileSync(new URL('../../../functions/storePaymentsCore.js', import.meta.url), 'utf8');
const functionsIndex = readFileSync(new URL('../../../functions/index.js', import.meta.url), 'utf8');

test('saved checkout contact is normalized and scoped to the current authenticated user', () => {
  assert.match(contactService, /const readString = .*value\.trim\(\)/);
  assert.match(contactService, /name: readString\(data\.name\)/);
  assert.match(contactService, /phone: readString\(data\.phone\)/);
  assert.match(contactService, /email: readString\(data\.email\)/);
  assert.match(contactService, /auth\.currentUser\.uid !== userId/);
  assert.match(contactService, /doc\(firestore, 'users', userId\)/);
  assert.match(contactService, /customerContact:/);
  assert.doesNotMatch(contactService, /where\(['"](?:email|phone|displayName)/);
});

test('authenticated checkout prefills and saves contact without changing guest fields', () => {
  assert.match(publicStorePage, /currentUser\.displayName/);
  assert.match(publicStorePage, /currentUser\.email/);
  assert.match(publicStorePage, /customerContactService\.load\(currentUser\.uid\)/);
  assert.match(publicStorePage, /customerContactService\.save\(currentUser\.uid/);
  assert.match(publicStorePage, /\{currentUser && \([\s\S]*aria-label="Email"/);
  assert.match(publicStorePage, /STORE_DRAFT_KEY_PREFIX/);
  assert.match(publicStorePage, /sessionStorage\.setItem\(storeDraftKey/);
});

test('optional order email is validated but ownership remains request auth UID only', () => {
  assert.match(paymentCore, /customerEmail/);
  assert.match(paymentCore, /Enter a valid email address/);
  assert.match(functionsIndex, /customerUid: request\.auth\?\.uid \|\| ''/);
  assert.doesNotMatch(functionsIndex, /customerUid: request\.data/);
});
