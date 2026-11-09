const { onCall, HttpsError } = require('firebase-functions/v2/https');

if (process.env.FUNCTIONS_EMULATOR !== 'true' || process.env.GCLOUD_PROJECT !== 'demo-misechef-preview') {
  throw new Error('Synthetic Functions emulator required');
}

exports.verifyQaSession = onCall(request => {
  const role = { 'synthetic-owner': 'Owner', 'synthetic-manager': 'Manager' }[request.auth?.uid];
  if (!role) throw new HttpsError('permission-denied', 'Synthetic QA account required');
  return { role };
});
