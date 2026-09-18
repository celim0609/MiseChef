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
  owner = environment.authenticatedContext('owner-a');
  unrelatedUser = environment.authenticatedContext('owner-b');
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
