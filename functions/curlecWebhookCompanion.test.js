import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createCurlecStorePaymentWebhookHandler } from './index.js';

const webhookSecret = 'curlec-webhook-secret-for-test-only';
const orderId = 'misechef-payment-link-order';

const copy = value => structuredClone(value);
const snapshot = value => ({ exists: value !== undefined, data: () => copy(value) });
const applyUpdate = (target, update) => {
  for (const [path, value] of Object.entries(update)) {
    const keys = path.split('.');
    const last = keys.pop();
    const destination = keys.reduce((object, key) => (object[key] ||= {}), target);
    destination[last] = value;
  }
};

const createMemoryDb = initialOrders => {
  const collections = new Map(Object.entries({ storeOrders: copy(initialOrders), storePaymentEvents: {}, storeNotifications: {}, storeOrderTimeline: {} }));
  const reference = (collection, id) => ({ collection, id, __reference: true });
  const document = (collection, id) => ({
    collection, id, __reference: true,
    get: async () => snapshot(collections.get(collection)[id]),
    set: async value => { collections.get(collection)[id] = copy(value); }
  });
  const db = {
    collection: name => ({
      doc: id => document(name, id),
      where: () => ({ limit: () => ({ __query: true }) })
    }),
    runTransaction: async callback => callback({
      get: async item => item.__query
        ? { empty: true, docs: [] }
        : snapshot(collections.get(item.collection)[item.id]),
      update: (item, update) => applyUpdate(collections.get(item.collection)[item.id], update),
      create: (item, value) => { collections.get(item.collection)[item.id] = copy(value); }
    })
  };
  return { db, order: id => copy(collections.get('storeOrders')[id]) };
};

const paymentLinkOrder = ({ status = 'pending' } = {}) => ({
  id: orderId,
  orderNumber: 'MC-0919-LINK',
  currency: 'MYR',
  status: status === 'paid' ? 'Paid' : 'Awaiting Payment',
  payment: {
    provider: 'curlec', providerMode: 'payment_link', providerPaymentId: 'plink_link_1',
    amountMinor: 100, status
  }
});
const standardOrder = ({ status = 'pending' } = {}) => ({
  id: 'misechef-standard-order', orderNumber: 'MC-0919-STANDARD', currency: 'MYR',
  status: status === 'paid' ? 'Paid' : 'Awaiting Payment',
  payment: {
    provider: 'curlec', providerMode: 'standard_checkout', providerPaymentId: 'order_standard_1',
    amountMinor: 100, status
  }
});

const payment = ({ status = 'captured', captured = true, orderId: gatewayOrderId = 'order_link_1', notes = { misechefOrderId: orderId } } = {}) => ({
  id: 'pay_1', order_id: gatewayOrderId, amount: 100, currency: 'MYR', status, captured, notes, method: 'fpx'
});
const paymentLinkPaid = () => ({
  event: 'payment_link.paid', payload: {
    payment_link: { entity: { id: 'plink_link_1', notes: { misechefOrderId: orderId } } },
    payment: { entity: payment() }
  }
});
const companion = (event, overrides = {}) => ({ event, payload: { payment: { entity: payment(overrides) } } });

const invoke = async ({ handler, payload, rawBody = JSON.stringify(payload), signature, eventId = 'evt_1' }) => {
  let statusCode;
  let body;
  await handler({
    method: 'POST', body: payload, rawBody: Buffer.from(rawBody),
    get: name => name.toLowerCase() === 'x-razorpay-signature'
      ? (signature === undefined ? createHmac('sha256', webhookSecret).update(rawBody).digest('hex') : signature)
      : name.toLowerCase() === 'x-razorpay-event-id' ? eventId : undefined
  }, {
    status: code => ({ json: value => { statusCode = code; body = value; }, send: value => { statusCode = code; body = value; } })
  });
  return { statusCode, body };
};

const handlerFor = db => createCurlecStorePaymentWebhookHandler({
  webhookDb: db, getCurlecKeyId: () => 'key_id', getCurlecKeySecret: () => 'key_secret', getWebhookSecret: () => webhookSecret
});

test('signed Payment Link companion events are idempotent after payment_link.paid', async () => {
  const memory = createMemoryDb({ [orderId]: paymentLinkOrder() });
  const handler = handlerFor(memory.db);

  assert.equal((await invoke({ handler, payload: paymentLinkPaid(), eventId: 'link-paid' })).statusCode, 200);
  assert.equal(memory.order(orderId).payment.status, 'paid');

  for (const event of ['payment.captured', 'order.paid']) {
    const result = await invoke({ handler, payload: companion(event), eventId: `link-${event}` });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { received: true, ignored: true, reason: 'payment_link_companion_event' });
    assert.equal(memory.order(orderId).payment.status, 'paid');
    assert.equal(memory.order(orderId).payment.providerPaymentId, 'plink_link_1');
  }
});

test('a delayed signed payment_link.paid webhook is idempotent after provider reconciliation', async () => {
  const memory = createMemoryDb({ [orderId]: paymentLinkOrder({ status: 'paid' }) });
  const handler = handlerFor(memory.db);
  const result = await invoke({ handler, payload: paymentLinkPaid(), eventId: 'delayed-link-paid' });
  assert.equal(result.statusCode, 200);
  assert.equal(memory.order(orderId).status, 'Paid');
  assert.equal(memory.order(orderId).payment.status, 'paid');
  assert.equal(memory.order(orderId).payment.providerPaymentId, 'plink_link_1');
});

test('signed payment.failed reconciles Standard Checkout but not an associated Payment Link', async () => {
  const standard = createMemoryDb({ 'misechef-standard-order': standardOrder() });
  const standardResult = await invoke({
    handler: handlerFor(standard.db),
    payload: companion('payment.failed', {
      status: 'failed', captured: false, orderId: 'order_standard_1', notes: { misechefOrderId: 'misechef-standard-order' }
    })
  });
  assert.equal(standardResult.statusCode, 200);
  assert.equal(standard.order('misechef-standard-order').payment.status, 'failed');

  const link = createMemoryDb({ [orderId]: paymentLinkOrder({ status: 'paid' }) });
  const linkResult = await invoke({
    handler: handlerFor(link.db), payload: companion('payment.failed', { status: 'failed', captured: false })
  });
  assert.equal(linkResult.statusCode, 200);
  assert.equal(link.order(orderId).payment.status, 'paid');
});

test('signed supported events without a matching order remain rejected', async () => {
  const memory = createMemoryDb({});
  const result = await invoke({ handler: handlerFor(memory.db), payload: companion('payment.captured', {
    notes: { misechefOrderId: 'missing-order' }
  }) });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body, 'Webhook rejected');
});

test('missing, invalid, and raw-body-altered signatures remain rejected', async () => {
  const handler = handlerFor(createMemoryDb({ [orderId]: paymentLinkOrder() }).db);
  const payload = paymentLinkPaid();
  assert.equal((await invoke({ handler, payload, signature: '' })).statusCode, 400);
  assert.equal((await invoke({ handler, payload, signature: '0'.repeat(64) })).statusCode, 400);
  const signedBody = JSON.stringify(payload);
  assert.equal((await invoke({
    handler, payload, rawBody: `${signedBody} `,
    signature: createHmac('sha256', webhookSecret).update(signedBody).digest('hex')
  })).statusCode, 400);
});

test('all configured Curlec event routes are explicit', async () => {
  const memory = createMemoryDb({ [orderId]: paymentLinkOrder(), 'misechef-standard-order': standardOrder() });
  const handler = handlerFor(memory.db);
  assert.equal((await invoke({ handler, payload: paymentLinkPaid(), eventId: 'routing-link' })).statusCode, 200);
  assert.equal((await invoke({ handler, payload: companion('payment.captured'), eventId: 'routing-captured' })).statusCode, 200);
  assert.equal((await invoke({ handler, payload: companion('order.paid'), eventId: 'routing-order-paid' })).statusCode, 200);
  assert.equal((await invoke({ handler, payload: companion('payment.failed', { status: 'failed', captured: false }), eventId: 'routing-failed' })).statusCode, 200);
});
