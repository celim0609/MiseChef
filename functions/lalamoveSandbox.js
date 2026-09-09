import { createHmac, randomUUID } from 'node:crypto';

// This module deliberately has no production host or environment switch.
const HOST = 'https://rest.sandbox.lalamove.com';
const VERSIONED_PATH = '/v3';
const text = value => typeof value === 'string' ? value.trim() : '';

const signedRequest = async ({ apiKey, apiSecret, method, path, market, body }) => {
  const serialized = body ? JSON.stringify(body) : '';
  const timestamp = Date.now().toString();
  const source = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${serialized}`;
  const signature = createHmac('sha256', apiSecret).update(source).digest('hex');
  const response = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${apiKey}:${timestamp}:${signature}`,
      'Content-Type': 'application/json',
      Market: market,
      'Request-ID': randomUUID()
    },
    ...(body ? { body: serialized } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(text(payload?.errors?.[0]?.id) || text(payload?.message) || 'Lalamove request failed.');
    error.status = response.status;
    error.requestId = text(payload?.meta?.requestId);
    throw error;
  }
  return payload.data;
};

export const createLalamoveSandboxProvider = ({ apiKey, apiSecret }) => {
  if (!text(apiKey) || !text(apiSecret)) throw new Error('Lalamove Sandbox is not configured.');
  const request = ({ method, path, market, body }) => signedRequest({ apiKey, apiSecret, method, path, market, body });
  return {
    getCityInfo: market => request({ method: 'GET', path: `${VERSIONED_PATH}/cities`, market }),
    createQuote: ({ market, data }) => request({ method: 'POST', path: `${VERSIONED_PATH}/quotations`, market, body: { data } }),
    retrieveQuote: ({ market, quotationId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/quotations/${encodeURIComponent(quotationId)}`, market }),
    createOrder: ({ market, data }) => request({ method: 'POST', path: `${VERSIONED_PATH}/orders`, market, body: { data } }),
    retrieveOrder: ({ market, orderId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}`, market }),
    retrieveDriver: ({ market, orderId, driverId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(driverId)}`, market }),
    cancelOrder: ({ market, orderId }) => request({ method: 'DELETE', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}`, market })
  };
};
