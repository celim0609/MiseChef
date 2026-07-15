import { loadEnv } from 'vite';

const requiredFirebaseVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
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

const missingVariables = requiredFirebaseVariables.filter(
  variableName => !isUsableValue(environment[variableName]),
);

if (missingVariables.length > 0) {
  console.error(
    `Firebase environment preflight failed. Missing or invalid: ${missingVariables.join(', ')}`,
  );
  process.exit(1);
}

console.log('Firebase environment preflight passed.');
