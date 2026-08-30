import { loadEnv } from 'vite';
import fs from 'node:fs';
import {
  firebaseEnvironmentVariables,
  loadProductionFirebaseEnvironment,
} from './productionFirebaseEnv.mjs';

const requiredFirebaseVariables = [
  ...firebaseEnvironmentVariables,
  'VITE_STRIPE_PUBLISHABLE_KEY',
];

const deploymentTarget = process.env.FIREBASE_DEPLOY_TARGET?.trim() || 'production';
const environmentMode = deploymentTarget === 'beta' ? 'beta' : 'production';
const fileEnvironment = loadEnv(environmentMode, process.cwd(), '');
const environment = {
  ...fileEnvironment,
  ...(deploymentTarget === 'production' ? loadProductionFirebaseEnvironment() : {}),
  ...process.env,
};

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
  if (variableName === 'VITE_FIREBASE_API_KEY') {
    return !/^AIza[0-9A-Za-z_-]{35}$/.test(value.trim());
  }
  if (variableName === 'VITE_STRIPE_PUBLISHABLE_KEY') {
    return !/^pk_(test|live)_[A-Za-z0-9]+$/.test(value.trim());
  }
  return false;
});

const firebaseProjects = fs.existsSync('.firebaserc')
  ? JSON.parse(fs.readFileSync('.firebaserc', 'utf8')).projects
  : undefined;
const firebaseProject = firebaseProjects?.[deploymentTarget]
  || (deploymentTarget === 'production' ? firebaseProjects?.default : undefined);

const configurationMismatches = firebaseProject
  ? [
    environment.VITE_FIREBASE_PROJECT_ID !== firebaseProject
      ? 'VITE_FIREBASE_PROJECT_ID'
      : null,
    environment.VITE_FIREBASE_AUTH_DOMAIN !== `${firebaseProject}.firebaseapp.com`
      ? 'VITE_FIREBASE_AUTH_DOMAIN'
      : null,
    ![
      `${firebaseProject}.appspot.com`,
      `${firebaseProject}.firebasestorage.app`,
    ].includes(environment.VITE_FIREBASE_STORAGE_BUCKET)
      ? 'VITE_FIREBASE_STORAGE_BUCKET'
      : null,
  ].filter(Boolean)
  : [];

if (missingVariables.length > 0) {
  console.error(
    `Firebase environment preflight failed. Missing or invalid: ${missingVariables.join(', ')}`,
  );
  process.exit(1);
}

if (configurationMismatches.length > 0) {
  console.error(
    `Firebase environment preflight failed. Configuration does not match project ${firebaseProject}: ${configurationMismatches.join(', ')}`,
  );
  process.exit(1);
}

console.log('Firebase environment preflight passed.');
