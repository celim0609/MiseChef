import { HttpsError } from 'firebase-functions/v2/https';
import { createHmac, randomUUID } from 'node:crypto';

// Hosts are deliberately fixed here. Neither Store data nor a browser request
// can select a Lalamove host.
export const LALAMOVE_ENVIRONMENTS = Object.freeze({
  sandbox: Object.freeze({ host: 'https://rest.sandbox.lalamove.com' }),
  production: Object.freeze({ host: 'https://rest.lalamove.com' })
});
const PROJECT_ENVIRONMENTS = Object.freeze({
  'misechef-beta-fa4bf': 'sandbox',
  'misechef-fa4bf': 'production'
});
const VERSIONED_PATH = '/v3';
const text = value => typeof value === 'string' ? value.trim() : '';

export const resolveLalamoveEnvironment = projectId => {
  const environment = PROJECT_ENVIRONMENTS[text(projectId)];
  if (!environment) throw new Error('Lalamove is not configured for this Firebase project.');
  return environment;
};

const signedRequest = async ({ host, apiKey, apiSecret, method, path, market, body }) => {
  const serialized = body ? JSON.stringify(body) : '';
  const timestamp = Date.now().toString();
  const source = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${serialized}`;
  const signature = createHmac('sha256', apiSecret).update(source).digest('hex');
  let response;
  const clientRequestId = randomUUID();
  try { response = await fetch(`${host}${path}`, {
    signal: AbortSignal.timeout(15_000),
    method,
    headers: {
      Authorization: `hmac ${apiKey}:${timestamp}:${signature}`,
      'Content-Type': 'application/json',
      Market: market,
      'Request-ID': clientRequestId
    },
    ...(body ? { body: serialized } : {})
  }); } catch { const error = new HttpsError('unavailable', 'Delivery provider did not respond. Refresh the quote; check existing dispatch status before requesting a replacement.', { requestId: clientRequestId }); error.requestId = clientRequestId; throw error; }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = text(payload?.errors?.[0]?.id) || text(payload?.message);
    const messages = {
      ERR_INSUFFICIENT_CREDIT: 'Lalamove rejected the booking because the merchant wallet has insufficient credit. Top up the correct Lalamove account, then request and confirm a new quotation.',
      ERR_MISSING_FIELD: 'Lalamove rejected a missing required booking field. Check the quotation stop IDs, sender and recipient contacts. No replacement is submitted automatically.',
      ERR_INVALID_FIELD: 'Lalamove rejected a booking field format. Check map coordinates, service type, quotation stop IDs and contact phone country codes.',
      ERR_OUT_OF_SERVICE_AREA: 'Lalamove does not serve this route. Choose another delivery location.',
      ERR_INVALID_SERVICE_TYPE: 'The Store delivery vehicle is unavailable for this route. Ask the Store to review its Lalamove service type.',
      ERR_INVALID_SCHEDULE_TIME: 'The delivery time is unavailable. Choose a future delivery time.',
      ERR_INVALID_PHONE_NUMBER: 'Check the sender and recipient phone numbers, including country codes.'
    };
    const code = response.status === 401 || response.status === 403 ? 'failed-precondition' : response.status === 429 || response.status >= 500 ? 'unavailable' : 'invalid-argument';
    const message = response.status === 401 || response.status === 403
      ? 'Lalamove authentication failed. The Store must check its delivery credentials for this environment.'
      : messages[providerCode] || (code === 'unavailable' ? 'Lalamove is temporarily unavailable. Please try again later.' : 'Lalamove rejected the delivery request. Review the route, service and schedule.');
    const allowedFields = ['quotationId', 'sender.stopId', 'sender.name', 'sender.phone', 'recipients[0].stopId', 'recipients[0].name', 'recipients[0].phone', 'serviceType', 'scheduleAt', 'stops[0].coordinates.lat', 'stops[0].coordinates.lng', 'stops[1].coordinates.lat', 'stops[1].coordinates.lng'];
    const diagnostic = JSON.stringify([payload.errors || [], payload.detail || '']);
    const fields = allowedFields.filter(field => diagnostic.includes(field));
    const requestId = text(payload?.meta?.requestId) || text(payload?.requestId) || text(response.headers.get('Request-ID')) || clientRequestId;
    const error = new HttpsError(code, `${message}${fields.length ? ` Fields: ${fields.join(', ')}.` : ''}`, { providerCode, fields, requestId });
    error.status = response.status;
    error.requestId = requestId;
    throw error;
  }
  return payload.data;
};

export const createLalamoveProvider = ({ environment, apiKey, apiSecret }) => {
  const config = LALAMOVE_ENVIRONMENTS[environment];
  if (!config) throw new Error('Lalamove environment is not configured.');
  if (!text(apiKey) || !text(apiSecret)) throw new Error(`Lalamove ${environment} is not configured.`);
  const request = ({ method, path, market, body }) => signedRequest({ host: config.host, apiKey, apiSecret, method, path, market, body });
  return {
    environment,
    getCityInfo: market => request({ method: 'GET', path: `${VERSIONED_PATH}/cities`, market }),
    createQuote: ({ market, data }) => request({ method: 'POST', path: `${VERSIONED_PATH}/quotations`, market, body: { data } }),
    retrieveQuote: ({ market, quotationId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/quotations/${encodeURIComponent(quotationId)}`, market }),
    createOrder: ({ market, data }) => request({ method: 'POST', path: `${VERSIONED_PATH}/orders`, market, body: { data } }),
    retrieveOrder: ({ market, orderId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}`, market }),
    retrieveDriver: ({ market, orderId, driverId }) => request({ method: 'GET', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(driverId)}`, market }),
    cancelOrder: ({ market, orderId }) => request({ method: 'DELETE', path: `${VERSIONED_PATH}/orders/${encodeURIComponent(orderId)}`, market })
  };
};

// Retained for compatibility with the existing Sandbox-focused unit tests and
// external callers. Runtime Functions use createLalamoveProvider instead.
export const createLalamoveSandboxProvider = credentials => createLalamoveProvider({ environment: 'sandbox', ...credentials });

// Only an actual structured non-retryable provider response proves rejection.
// Timeouts, transport errors, 429s and 5xx remain uncertain after submission.
export const isConfirmedProviderRejection = error => [400, 401, 402, 403, 422].includes(error?.status)
  && ['ERR_INSUFFICIENT_CREDIT', 'ERR_MISSING_FIELD', 'ERR_INVALID_FIELD', 'ERR_INVALID_PHONE_NUMBER', 'ERR_INVALID_SERVICE_TYPE', 'ERR_INVALID_SCHEDULE_TIME', 'ERR_OUT_OF_SERVICE_AREA'].includes(error?.details?.providerCode);
