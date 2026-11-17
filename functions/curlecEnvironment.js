import { HttpsError } from 'firebase-functions/v2/https';

export function storedCurlecEnvironment(order) {
  if (order?.payment?.provider !== 'curlec') throw new Error('Expected a saved Curlec order.');
  const mode = order.payment.curlecEnvironment;
  // Beta only created Live Mode Curlec orders before isolation. Legacy gateway
  // references and captures still have to match the original merchant.
  if (mode === undefined) return 'live';
  if (mode === 'live' || mode === 'test') return mode;
  throw new Error('Unknown stored Curlec environment.');
}

export function createModeBoundCurlecAdapter(createAdapter, mode, options) {
  const expected = mode === 'test' ? /^rzp_test_[A-Za-z0-9]+$/ : /^rzp_live_[A-Za-z0-9]+$/;
  if (!['live', 'test'].includes(mode) || !expected.test(options.curlecKeyId) || !options.curlecKeySecret)
    throw new HttpsError('failed-precondition', 'Curlec credentials are unavailable for this payment environment.');
  return { ...createAdapter('curlec', options), curlecEnvironment: mode };
}

export function assertCurlecEnvironment(order, mode) {
  if (mode === undefined && order?.payment?.curlecEnvironment !== 'test') return;
  if (storedCurlecEnvironment(order) !== mode) throw new Error('Curlec payment environment does not match the saved order.');
}
