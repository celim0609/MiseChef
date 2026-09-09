const CURLEC_WEBHOOK_REJECTION_STAGES = new Set([
  'signature',
  'dedupe_identity',
  'captured_event_validation',
  'provider_order_resolution',
  'event_dedupe_read',
  'reconciliation'
]);

const SAFE_ERROR_MESSAGES = new Set([
  'Invalid Curlec webhook signature.',
  'Curlec webhook has no stable event identity.',
  'Curlec paid event does not contain a captured payment.',
  'Curlec payment has no unique MiseChef order.',
  'Payment is missing its MiseChef order reference.',
  'The matching MiseChef order could not be found.',
  'Payment does not match this MiseChef order.',
  'Payment amount does not match this MiseChef order.',
  'Payment transaction is already bound to a different MiseChef order.'
]);

const toSafeCategory = error => {
  const name = typeof error?.name === 'string' ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : 'Error';
};

const rawBodyByteLength = rawBody => {
  if (Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array) return rawBody.byteLength;
  if (typeof rawBody === 'string') return Buffer.byteLength(rawBody, 'utf8');
  return 0;
};

export const getCurlecWebhookSignatureDiagnostics = ({ signature, rawBody }) => ({
  signaturePresent: typeof signature === 'string' && signature.length > 0,
  rawBodyPresent: rawBody !== undefined && rawBody !== null,
  rawBodyByteLength: rawBodyByteLength(rawBody)
});

export const createCurlecWebhookRejectionLog = ({ rejectionStage, error, signatureDiagnostics }) => {
  const stage = CURLEC_WEBHOOK_REJECTION_STAGES.has(rejectionStage)
    ? rejectionStage
    : 'reconciliation';
  const originalMessage = typeof error?.message === 'string' ? error.message : '';
  const diagnostic = {
    rejectionStage: stage,
    errorCategory: toSafeCategory(error),
    // Preserve known, static internal messages without ever logging arbitrary
    // provider, request, Firestore, or secret-bearing error text.
    errorMessage: SAFE_ERROR_MESSAGES.has(originalMessage)
      ? originalMessage
      : `Curlec webhook ${stage} rejected.`
  };
  if (stage === 'signature') Object.assign(diagnostic, signatureDiagnostics);
  return diagnostic;
};
