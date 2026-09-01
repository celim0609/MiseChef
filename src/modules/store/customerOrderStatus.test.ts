import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomerOrderStatus } from './customerOrderStatus';

test('customer lifecycle hides internal payment and fulfilment terminology', () => {
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'pending' }), 'Payment Pending');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'pending_verification', fulfilmentStatus: 'New' }), 'Payment Pending');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'New' }), 'Order Confirmed');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'Confirmed' }), 'Order Confirmed');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'Preparing' }), 'Preparing');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'Ready' }), 'Ready for Pickup');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'Completed' }), 'Completed');
});

test('cash confirmation and exception states remain explicit', () => {
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'pending', orderStatus: 'Confirmed' }), 'Order Confirmed');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'rejected' }), 'Payment Rejected');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'cancelled' }), 'Cancelled');
  assert.equal(getCustomerOrderStatus({ paymentStatus: 'paid', fulfilmentStatus: 'Cancelled' }), 'Cancelled');
});
