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
  const response = await fetch(`${host}${path}`, {
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
