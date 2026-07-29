import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export const firebaseEnvironmentVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

export const loadProductionFirebaseEnvironment = (
  cwd = process.cwd(),
  runtimeEnvironment = process.env,
) => {
  const baseEnvironmentPath = path.join(cwd, '.env');
  const baseEnvironment = fs.existsSync(baseEnvironmentPath)
    ? dotenv.parse(fs.readFileSync(baseEnvironmentPath))
    : {};

  return Object.fromEntries(
    firebaseEnvironmentVariables.map(variableName => [
      variableName,
      runtimeEnvironment[variableName] ?? baseEnvironment[variableName] ?? '',
    ]),
  );
};

export const createFirebaseViteDefinitions = environment => Object.fromEntries(
  firebaseEnvironmentVariables.map(variableName => [
    `import.meta.env.${variableName}`,
    JSON.stringify(environment[variableName] ?? ''),
  ]),
);
