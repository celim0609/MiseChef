import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-misechef-preview';
const CUSTOMER_NAME = 'Milestone 45E Refund';
const require = createRequire(import.meta.url);
const { initializeApp, deleteApp } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`
);
const { getFirestore } = require(
  `${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`
);
const Stripe = require(`${process.cwd()}/functions/node_modules/stripe`);

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = PROJECT_ID;

const secrets = Object.fromEntries(readFileSync('functions/.secret.local', 'utf8')
  .split(/\r?\n/)
  .filter(line => line && !line.startsWith('#') && line.includes('='))
  .map(line => {
    const separator = line.indexOf('=');
    return [
      line.slice(0, separator),
      line.slice(separator + 1).trim().replace(/^"|"$/g, '')
    ];
  }));
assert.match(secrets.STRIPE_SECRET_KEY || '', /^sk_test_/);

const app = initializeApp({ projectId: PROJECT_ID }, 'refund-stripe-qa');
const db = getFirestore(app);
const orderSnapshot = await db.collection('storeOrders')
  .where('customerName', '==', CUSTOMER_NAME)
  .get();
assert.equal(orderSnapshot.size, 1, 'Expected one refundable isolated sandbox order.');
const orderDocument = orderSnapshot.docs[0];
const order = orderDocument.data();
assert.equal(order.payment?.status, 'paid');
assert.ok(order.payment?.providerPaymentId);

const stripe = new Stripe(secrets.STRIPE_SECRET_KEY);
await stripe.refunds.create({
  payment_intent: order.payment.providerPaymentId,
  metadata: {
    misechef_order_id: orderDocument.id,
    reason: 'milestone_45e_sandbox_qa'
  }
});

console.log(JSON.stringify({
  orderId: orderDocument.id,
  orderNumber: order.orderNumber,
  refundRequest: 'submitted_in_stripe_test_mode'
}, null, 2));
await deleteApp(app);
