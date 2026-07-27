import { loadEnv } from 'vite';

const requiredFirebaseVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY',
];

const fileEnvironment = loadEnv('production', process.cwd(), '');
const environment = { ...fileEnvironment, ...process.env };

const isUsableValue = value => {
  if (typeof value !== 'string') return false;
  const normalizedValue = value.trim();
  return Boolean(normalizedValue)
    && normalizedValue !== '...'
    && !normalizedValue.startsWith('MY_FIREBASE_');
};

const missingVariables = requiredFirebaseVariables.filter(variableName => {
  const value = environment[variableName];
  if (!isUsableValue(value)) return true;
  if (variableName === 'VITE_STRIPE_PUBLISHABLE_KEY') {
    return !/^pk_(test|live)_[A-Za-z0-9]+$/.test(value.trim());
  }
  return false;
});

if (missingVariables.length > 0) {
  console.error(
    `Firebase environment preflight failed. Missing or invalid: ${missingVariables.join(', ')}`,
  );
  process.exit(1);
}

console.log('Firebase environment preflight passed.');
