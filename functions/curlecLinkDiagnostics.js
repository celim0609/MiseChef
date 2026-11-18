// Metadata stays out of enumerable Error properties and callable responses.
const diagnostics = new WeakMap();
const failures = new WeakMap();
const categories = new Set(['provider_http_rejection', 'timeout', 'transport_failure', 'malformed_response', 'validation_failure']);
const providerCodes = new Set(['BAD_REQUEST_ERROR', 'GATEWAY_ERROR', 'SERVER_ERROR', 'AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR', 'RATE_LIMIT_ERROR']);

export function annotateCurlecLinkError(error, { category, httpStatus, providerCode } = {}) {
  if (!error || !['object', 'function'].includes(typeof error)) return error;
  diagnostics.set(error, {
    category: categories.has(category) ? category : 'validation_failure',
    httpStatus: Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null,
    providerCode: providerCodes.has(providerCode) ? providerCode : 'unavailable',
  });
  return error;
}

export const curlecTransportCategory = error =>
  ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport_failure';
export const curlecBodyCategory = error => error?.name === 'SyntaxError' ? 'malformed_response' : curlecTransportCategory(error);

export function emitCurlecLinkDiagnostic(onDiagnostic, { error, correlationId, mode, operation, outcome = 'failed', durationMs = 0 }) {
  const metadata = diagnostics.get(error) || { category: 'validation_failure', httpStatus: null, providerCode: 'unavailable' };
  const record = {
    correlationId: /^[0-9a-f-]{36}$/.test(correlationId) ? correlationId : 'unavailable',
    mode: ['live', 'test'].includes(mode) ? mode : 'unknown',
    operation: ['create', 'lookup', 'recovery_lookup'].includes(operation) ? operation : 'unknown',
    outcome: ['failed', 'not_found', 'recovered'].includes(outcome) ? outcome : 'failed',
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
    ...(outcome === 'failed' ? metadata : {}),
  };
  // Logging must never affect provider recovery, retry, or payment state.
  try { onDiagnostic(record); } catch { /* diagnostic sink only */ }
}

export function preserveCurlecLinkFailures(error, originalError, recoveryLookupError = null) {
  if (!error || !['object', 'function'].includes(typeof error)) return error;
  failures.set(error, { originalError, recoveryLookupError });
  return error;
}
export const getCurlecLinkFailures = error => failures.get(error);

export async function recoverCurlecLinkCreation({ originalError, operation, lookup, onDiagnostic, correlationId, mode, durationMs }) {
  emitCurlecLinkDiagnostic(onDiagnostic, { error: originalError, correlationId, mode, operation, durationMs });
  const started = Date.now();
  try {
    const result = await lookup();
    emitCurlecLinkDiagnostic(onDiagnostic, { correlationId, mode, operation: 'recovery_lookup',
      outcome: result ? 'recovered' : 'not_found', durationMs: Date.now() - started });
    return result;
  } catch (lookupError) {
    emitCurlecLinkDiagnostic(onDiagnostic, { error: lookupError, correlationId, mode,
      operation: 'recovery_lookup', durationMs: Date.now() - started });
    throw preserveCurlecLinkFailures(lookupError, originalError, lookupError);
  }
}
