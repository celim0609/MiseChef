import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getValidatedPublicAccountReturnTo } from '../public/hostReturnNavigation';
import { getCustomerOrderConfirmationCopy } from './customerOrderConfirmation';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');
const publicGroupPage = readFileSync(new URL('./PublicGroupOrderPage.tsx', import.meta.url), 'utf8');
const publicLayout = readFileSync(new URL('../public/PublicLayout.tsx', import.meta.url), 'utf8');
const hostPage = readFileSync(new URL('./HostProgramPage.tsx', import.meta.url), 'utf8');
const storeOrdersPanel = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
const groupBackend = readFileSync(new URL('../../../functions/groupOrders.js', import.meta.url), 'utf8');
const paymentCore = readFileSync(new URL('../../../functions/storePaymentsCore.js', import.meta.url), 'utf8');

test('customer confirmation copy never confuses order, proof, and paid states', () => {
  assert.deepEqual(getCustomerOrderConfirmationCopy('pending_verification'), {
    heading: 'Payment Proof Submitted',
    message: 'Your order has been received. We are verifying your payment. You do not need to pay again.',
    paymentLabel: 'Payment verification pending'
  });
  assert.deepEqual(getCustomerOrderConfirmationCopy('paid'), {
    heading: 'Payment Confirmed',
    message: 'Your payment was received and your order is confirmed.',
    paymentLabel: 'Paid'
  });
  assert.equal(getCustomerOrderConfirmationCopy('pending').heading, 'Order Successfully Submitted');
  assert.doesNotMatch(JSON.stringify(getCustomerOrderConfirmationCopy('pending_verification')), /Payment Confirmed|"Paid"/);
});

test('Group entry, checkout, and confirmation show trusted Group and pickup continuity', () => {
  assert.match(publicStorePage, /Joined \{groupOrder\.name\} Group/);
  assert.match(publicStorePage, /Hosted by \{groupOrder\.hostName\}/);
  assert.match(publicStorePage, /Joining the Group does not submit an order/);
  assert.match(publicStorePage, /Pickup is coordinated with your Group Host/);
  assert.match(publicStorePage, /paymentSession\.groupOrder/);
  assert.match(publicStorePage, /placedOrder\.groupOrder/);
  assert.match(publicStorePage, /Your order was added to \{placedOrder\.groupOrder\.name\} Group/);
  const projectionStart = paymentCore.indexOf('export const toPublicGroupOrderContext');
  const projectionEnd = paymentCore.indexOf('export const toPublicOrderResult', projectionStart);
  const projection = paymentCore.slice(projectionStart, projectionEnd);
  assert.match(projection, /const id = readString\(order\?\.groupOrder\?\.id\)/);
  assert.doesNotMatch(projection, /shareCode|hostId|customerUid/);
});

test('Guest remains optional while signed-in customers receive My Orders continuity', () => {
  assert.match(publicStorePage, /Sign In \/ Create Account/);
  assert.match(publicStorePage, /Continue as Guest/);
  assert.match(publicStorePage, /Guest checkout remains available/);
  assert.match(publicStorePage, /Creating an account later will not claim this order/);
  assert.match(publicStorePage, /currentUser \? \(/);
  assert.match(publicStorePage, /href="\/orders"/);
  assert.match(publicStorePage, /Account → My Orders/);
  assert.match(publicGroupPage, /currentUser=\{currentUser\}/);
  assert.match(publicLayout, /currentUser=\{currentUser\}/);
});

test('exact Group login return is allowed while malicious variants remain rejected', () => {
  assert.equal(getValidatedPublicAccountReturnTo('?returnTo=%2Fgroup%2Ffull_group-a'), '/group/full_group-a');
  for (const search of [
    '?returnTo=%2Fgroup',
    '?returnTo=%2Fgroup%2Fa%2Fmanage',
    '?returnTo=%2Fgroup%2Fa%3Fnext%3D%2Fapp',
    '?returnTo=https%3A%2F%2Fevil.example%2Fgroup%2Fa',
    '?returnTo=%2F%2Fevil.example%2Fgroup%2Fa'
  ]) assert.equal(getValidatedPublicAccountReturnTo(search), '');
});

test('refresh recovery rechecks an existing payment result and never creates a second order', () => {
  const recoveryStart = publicStorePage.indexOf('const recovery = readCheckoutRecovery');
  const recoveryEnd = publicStorePage.indexOf('const query = new URLSearchParams', recoveryStart + 1);
  const recoveryFlow = publicStorePage.slice(recoveryStart, recoveryEnd);
  assert.match(recoveryFlow, /storePaymentService\.getResult/);
  assert.doesNotMatch(recoveryFlow, /createPayment/);
  assert.match(publicStorePage, /GROUP_DRAFT_KEY_PREFIX.*groupOrder\.id/s);
  assert.match(publicStorePage, /parsed\.groupId !== groupOrder\.id/);
});

test('Host member item snapshots stay separated by order and remain read-only', () => {
  assert.match(hostPage, /managedOrders\.map\(order/);
  assert.match(hostPage, /<article key=\{order\.id\}/);
  assert.match(hostPage, /order\.items\.map/);
  assert.match(hostPage, /item\.setSelections\.map/);
  assert.match(hostPage, /item\.selectedOptions\.map/);
  assert.match(hostPage, /Remark:/);
  assert.match(hostPage, /View only\. Store payment, refund and fulfilment controls remain with Store operators/);
  assert.doesNotMatch(hostPage, /Confirm Payment|Refund Order|Mark Preparing|Mark Ready/);
  assert.match(groupBackend, /where\('groupOrder\.id', '==', normalizedGroupId\)/);
  assert.doesNotMatch(groupBackend, /customerUid:/);
});

test('Store operator confirmation cue is explicit and WhatsApp remains manual', () => {
  assert.match(storeOrdersPanel, /selectedOrder\.payment\.status === 'paid'/);
  assert.match(storeOrdersPanel, /Payment confirmed ✓/);
  assert.match(storeOrdersPanel, /Next: Send customer confirmation via WhatsApp/);
  assert.match(storeOrdersPanel, /<WhatsAppCustomerButton/);
  assert.doesNotMatch(storeOrdersPanel, /sendWhatsApp|window\.open/);
});
