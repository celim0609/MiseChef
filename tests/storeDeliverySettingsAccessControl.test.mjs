import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-misechef-delivery-settings-rules';
const WORKSPACE_ID = 'delivery-settings-workspace';
const STORE_PATH = `stores/${WORKSPACE_ID}`;
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const delivery = ({ deliveryHours = { from: '09:00', to: '21:00' }, maximumDistanceKm = 4, ...preOrder } = {}) => ({
  enabled: true,
  provider: 'lalamove',
  environment: 'production',
  market: 'MY',
  pickupLocationId: 'pickup-a',
  serviceType: 'MOTORCYCLE',
  pickup: {
    name: 'Pickup', address: '1 Test Street', latitude: '4.6', longitude: '101.1', contactName: 'Sender', contactPhoneE164: '+60123456789'
  },
  subsidy: { enabled: false, minimumMerchandiseSpend: 0, maximumCustomerDeliveryCharge: 0 },
  fulfilment: {
    preOrder: {
      enabled: true,
      orderDays: ['monday'],
      earliestDays: 0,
      maximumAdvanceDays: 14,
      unavailableDates: [],
      deliveryHours,
      maximumDistanceKm,
      ...preOrder
    },
    instant: { enabled: false, operatingHours: { start: '09:00', end: '21:00' }, preparationMinutes: 20 }
  }
});

let environment;
let owner;
let unrelatedUser;

before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: firestoreRules } });
  owner = environment.authenticatedContext('owner-a', { email: 'owner-a@example.test' });
  unrelatedUser = environment.authenticatedContext('owner-b', { email: 'owner-b@example.test' });
  await environment.withSecurityRulesDisabled(async context => {
    await context.firestore().doc(`workspaces/${WORKSPACE_ID}`).set({
      id: WORKSPACE_ID,
      ownerId: 'owner-a',
      country: 'MY',
      subscriptionPlan: 'professional',
      subscriptionStatus: 'active'
    });
    await context.firestore().doc(STORE_PATH).set({ id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, deliveryEnabled: false });
  });
});

after(async () => {
  await environment.cleanup();
});

test('authorized Store owner can save deliveryHours', async () => {
  await assertSucceeds(owner.firestore().doc(STORE_PATH).update({
    delivery: delivery({ deliveryHours: { from: '10:00', to: '22:00' } }),
    deliveryEnabled: true,
    updatedAt: '2026-09-18T06:00:00.000Z'
  }));
});

test('authorized Store owner can save maximumDistanceKm', async () => {
  await assertSucceeds(owner.firestore().doc(STORE_PATH).update({
    delivery: delivery({ maximumDistanceKm: 4 }),
    deliveryEnabled: true,
    updatedAt: '2026-09-18T06:01:00.000Z'
  }));
});

test('legacy delivery sessions remain compatible and an unrelated user remains rejected', async () => {
  const legacyDelivery = delivery({ sessions: ['Lunch'] });
  delete legacyDelivery.fulfilment.preOrder.deliveryHours;
  delete legacyDelivery.fulfilment.preOrder.maximumDistanceKm;
  await assertSucceeds(owner.firestore().doc(STORE_PATH).update({
    delivery: legacyDelivery,
    deliveryEnabled: true,
    updatedAt: '2026-09-18T06:02:00.000Z'
  }));
  await assertFails(unrelatedUser.firestore().doc(STORE_PATH).update({
    delivery: delivery(),
    deliveryEnabled: true,
    updatedAt: '2026-09-18T06:03:00.000Z'
  }));
});

test('invalid delivery schema remains rejected for an authorized Store owner', async () => {
  await assertFails(owner.firestore().doc(STORE_PATH).update({
    delivery: delivery({ deliveryHours: { from: '9am', to: '21:00' } }),
    deliveryEnabled: true,
    updatedAt: '2026-09-18T06:04:00.000Z'
  }));
});

// Complete Store with delivery enabled: the minimal fixture above only exercises
// isolated update exceptions and does not catch the whole-settings rule budget.
const completeStore = () => ({
  id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, slug: 'settings-regression',
  name: 'Settings regression', logoUrl: '', coverImageUrl: '', description: '',
  contactInformation: '', businessWhatsApp: '',
  storeContact: { phone: '', email: '', whatsapp: '', facebook: '', instagram: '', tiktok: '', website: '' },
  businessHours: 'Monday–Friday', country: 'MY', currency: 'MYR',
  pickupEnabled: true, deliveryEnabled: true,
  pickupOperatingHours: { start: '09:00', end: '18:00' },
  pickupSessions: [],
  pickupLocations: [{ id: 'pickup-a', name: 'Counter', address: '1 Test Street', notes: '' }],
  orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  earliestPickupDays: 1, maximumAdvanceDays: 7, unavailableDates: [],
  delivery: delivery({ sessions: ['Morning'] }),
  paymentMethods: ['cash_on_pickup', 'touch_n_go_qr', 'duitnow_qr', 'bank_transfer', 'stripe', 'curlec']
    .map(id => ({ id, enabled: id === 'curlec', qrCodeUrl: '', instructions: '' })),
  hostProgram: { enabled: false, rewardPercent: 5, minimumQualifyingSales: 20 },
  createdBy: 'owner-a', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z'
});
const resetCompleteStore = () => environment.withSecurityRulesDisabled(context =>
  context.firestore().doc(STORE_PATH).set(completeStore()));
const settingsChanges = {
  'Earliest Pickup': { earliestPickupDays: 0 },
  'Maximum Advance Booking': { maximumAdvanceDays: 14 },
  'Order Days': { orderDays: ['monday', 'wednesday'] },
  'Pickup configuration': { pickupSessions: ['Morning'], pickupLocations: [{ id: 'pickup-b', name: 'Counter B', address: '2 Test Street', notes: '' }] },
  'Pickup operating hours': { pickupOperatingHours: { start: '10:00', end: '17:00' } },
  'Delivery settings': { delivery: delivery({ maximumDistanceKm: 10, sessions: ['Morning'] }) },
  'combined Pickup & Delivery': {
    earliestPickupDays: 0, maximumAdvanceDays: 14, orderDays: ['monday', 'wednesday'],
    pickupOperatingHours: { start: '10:00', end: '17:00' },
    pickupSessions: ['Morning'], delivery: delivery({ maximumDistanceKm: 10, sessions: ['Morning'] })
  }
};
for (const [label, changes] of Object.entries(settingsChanges)) {
  test(`complete Store: Owner and Manager can save ${label} using the client merge operation`, async () => {
    await environment.withSecurityRulesDisabled(context => context.firestore()
      .doc(`workspaceMembers/${WORKSPACE_ID}_manager-a`)
      .set({ workspaceId: WORKSPACE_ID, userId: 'manager-a', role: 'Manager', status: 'Active' }));
    for (const actor of [owner, environment.authenticatedContext('manager-a', { email: 'manager-a@example.test' })]) {
      await resetCompleteStore();
      await assertSucceeds(actor.firestore().doc(STORE_PATH).set({
        ...changes, updatedAt: '2026-10-11T02:00:00.000Z'
      }, { merge: true }));
    }
  });
  test(`complete Store: unauthorized users cannot save ${label}`, async () => {
    await resetCompleteStore();
    await environment.withSecurityRulesDisabled(context => context.firestore()
      .doc(`workspaceMembers/${WORKSPACE_ID}_chef-a`)
      .set({ workspaceId: WORKSPACE_ID, userId: 'chef-a', role: 'Chef', status: 'Active' }));
    for (const actor of [unrelatedUser, environment.unauthenticatedContext(), environment.authenticatedContext('chef-a', { email: 'chef-a@example.test' })]) {
      await assertFails(actor.firestore().doc(STORE_PATH).set({
        ...changes, updatedAt: '2026-10-11T02:00:00.000Z'
      }, { merge: true }));
    }
  });
}

test('complete Store: invalid settings and protected fields remain denied', async () => {
  for (const changes of [
    { earliestPickupDays: 2 }, { maximumAdvanceDays: 365 }, { orderDays: ['holiday'] },
    { pickupOperatingHours: { start: '18:00', end: '09:00' } },
    { delivery: delivery({ maximumDistanceKm: 501, sessions: Array(21).fill('Morning') }) },
    { earliestPickupDays: 0, delivery: delivery({ maximumDistanceKm: 501, sessions: Array(21).fill('Morning') }) },
    { earliestPickupDays: 0, workspaceId: 'another-workspace' },
    { earliestPickupDays: 0, createdBy: 'owner-b' },
    { earliestPickupDays: 0, arbitraryField: true }
  ]) {
    await resetCompleteStore();
    await assertFails(owner.firestore().doc(STORE_PATH).set({
      ...changes, updatedAt: '2026-10-11T02:00:00.000Z'
    }, { merge: true }));
  }
});

test('complete Store: unrelated updates tolerate unchanged invalid legacy fields', async () => {
  await resetCompleteStore();
  await environment.withSecurityRulesDisabled(context => context.firestore().doc(STORE_PATH)
    .update({ storeContact: { phone: '' } }));
  await assertSucceeds(owner.firestore().doc(STORE_PATH).set({ earliestPickupDays: 0 }, { merge: true }));
  await assertFails(owner.firestore().doc(STORE_PATH).set({ storeContact: { phone: 'changed' } }, { merge: true }));
  // Preserve the existing isolated-hours exception for legacy Stores.
  await assertSucceeds(owner.firestore().doc(STORE_PATH).set({
    pickupOperatingHours: { start: '10:00', end: '17:00' }
  }, { merge: true }));
});


test('mixed groups reject invalid Pickup even when Delivery is valid', async () => {
  for (const invalid of [
    { earliestPickupDays: 2 }, { maximumAdvanceDays: 365 }, { orderDays: ['holiday'] },
    { pickupEnabled: 'yes' }, { pickupSessions: Array(21).fill('Morning') },
    { pickupLocations: Array(21).fill({ id: 'a' }) },
    { pickupOperatingHours: { start: '18:00', end: '09:00' } }
  ]) {
    await resetCompleteStore();
    await assertFails(owner.firestore().doc(STORE_PATH).set({
      ...invalid, delivery: delivery({ maximumDistanceKm: 10, sessions: ['Morning'] })
    }, { merge: true }));
  }
});

test('changed groups preserve branding, contact, host and Payment validation', async () => {
  for (const changes of [
    { name: 'Updated Store' }, { description: 'Updated description' },
    { storeContact: { ...completeStore().storeContact, phone: '+60123456789' } },
    { hostProgram: { enabled: true, rewardPercent: 10, minimumQualifyingSales: 0 } },
    { paymentMethods: completeStore().paymentMethods.map(method => ({ ...method, instructions: 'Updated' })) }
  ]) {
    await resetCompleteStore();
    await assertSucceeds(owner.firestore().doc(STORE_PATH).set({ ...changes, earliestPickupDays: 0 }, { merge: true }));
  }
  for (const changes of [
    { name: '' }, { description: 'x'.repeat(1201) }, { storeContact: { phone: 123 } },
    { hostProgram: { enabled: true, rewardPercent: 101, minimumQualifyingSales: 0 } },
    { paymentMethods: [] }, { updatedAt: 123 }
  ]) {
    await resetCompleteStore();
    await assertFails(owner.firestore().doc(STORE_PATH).set({ ...changes, earliestPickupDays: 0 }, { merge: true }));
  }
});

test('every immutable field remains protected on its own and in mixed updates', async () => {
  for (const field of ['id', 'workspaceId', 'slug', 'country', 'currency', 'createdBy', 'createdAt']) {
    for (const mixed of [{}, { earliestPickupDays: 0 }]) {
      await resetCompleteStore();
      await assertFails(owner.firestore().doc(STORE_PATH).update({ [field]: 'other', ...mixed }));
      await assertFails(owner.firestore().doc(STORE_PATH).update({ [field]: firebase.firestore.FieldValue.delete(), ...mixed }));
    }
  }
});

test('field removals enforce required groups and retain existing optional/isolated exceptions', async () => {
  for (const field of [
    'name', 'logoUrl', 'description', 'storeContact', 'businessHours', 'orderDays', 'earliestPickupDays',
    'maximumAdvanceDays', 'unavailableDates', 'pickupEnabled', 'pickupSessions', 'pickupLocations',
    'hostProgram', 'paymentMethods', 'delivery.pickup.address'
  ]) {
    await resetCompleteStore();
    await assertFails(owner.firestore().doc(STORE_PATH).update({ [field]: firebase.firestore.FieldValue.delete() }))
      .catch(error => { throw new Error(`Required removal passed: ${field}`, { cause: error }); });
  }
  for (const field of ['delivery', 'pickupOperatingHours', 'deliveryEnabled', 'updatedAt']) {
    await resetCompleteStore();
    await assertSucceeds(owner.firestore().doc(STORE_PATH).update({ [field]: firebase.firestore.FieldValue.delete() }))
      .catch(error => { throw new Error(`Allowed removal failed: ${field}`, { cause: error }); });
  }
});

test('existing isolated exceptions retain their legacy-field and timestamp behavior', async () => {
  for (const changes of [
    { unavailableDates: ['2026-10-12'] }, { pickupOperatingHours: { start: '10:00', end: '17:00' } },
    { delivery: delivery({ sessions: ['Morning'] }), deliveryEnabled: 'legacy' },
    { hostProgram: { enabled: true, rewardPercent: 5, minimumQualifyingSales: 20 } },
    { paymentMethods: completeStore().paymentMethods.map(method => ({ ...method, instructions: 'Changed' })) }
  ]) {
    await resetCompleteStore();
    await environment.withSecurityRulesDisabled(context => context.firestore().doc(STORE_PATH).update({
      storeContact: { phone: '' }, orderDays: ['legacy-invalid'], updatedAt: 'old'
    }));
    await assertSucceeds(owner.firestore().doc(STORE_PATH).update({ ...changes, updatedAt: 123 }));
  }
});

test('an unchanged invalid Delivery, Payment or Host group does not block Pickup booking', async () => {
  await resetCompleteStore();
  await environment.withSecurityRulesDisabled(context => context.firestore().doc(STORE_PATH).update({
    delivery: { enabled: 'legacy' }, paymentMethods: [], hostProgram: { enabled: 'legacy' }
  }));
  await assertSucceeds(owner.firestore().doc(STORE_PATH).update({ earliestPickupDays: 0 }));
  await assertSucceeds(owner.firestore().doc(STORE_PATH).update({ updatedAt: '2026-10-11T05:00:00.000Z' }));
});

test('inactive Manager and inactive business entitlement remain denied', async () => {
  await resetCompleteStore();
  await environment.withSecurityRulesDisabled(async context => {
    await context.firestore().doc(`workspaceMembers/${WORKSPACE_ID}_inactive-manager`).set({
      workspaceId: WORKSPACE_ID, userId: 'inactive-manager', role: 'Manager', status: 'Inactive'
    });
  });
  await assertFails(environment.authenticatedContext('inactive-manager', { email: 'inactive@example.test' })
    .firestore().doc(STORE_PATH).update({ earliestPickupDays: 0 }));
  await environment.withSecurityRulesDisabled(context => context.firestore().doc(`workspaces/${WORKSPACE_ID}`)
    .update({ subscriptionStatus: 'expired' }));
  await assertFails(owner.firestore().doc(STORE_PATH).update({ earliestPickupDays: 0 }));
  await environment.withSecurityRulesDisabled(context => context.firestore().doc(`workspaces/${WORKSPACE_ID}`)
    .update({ subscriptionStatus: 'active' }));
});
