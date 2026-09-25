import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BETA_APP_ENGINE_SERVICE_ACCOUNT, PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS, assert20260926PermissionPreflight } from './betaMixedRelease20260926Recovery.mjs';
import { BETA_PROJECT_ID, PINNED_FIREBASE_CLI_VERSION } from './betaDeploymentSafety.mjs';

const responseData = response => response?.data || response || {};
const assertPinnedCliPermissionSource = firebaseToolsRoot => {
  const source = readFileSync(path.join(firebaseToolsRoot, 'lib/commands/deploy.js'), 'utf8');
  if (!PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS.every(permission => source.includes(permission))
    || !source.includes('checkServiceAccountIam(options.project)')) {
    throw new Error(`firebase-tools ${PINNED_FIREBASE_CLI_VERSION} permission contract differs from the protected full deploy preflight.`);
  }
};

export const run20260926PermissionPreflight = async ({ request, firebaseToolsRoot }) => {
  assertPinnedCliPermissionSource(firebaseToolsRoot);
  const project = responseData(await request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${BETA_PROJECT_ID}:testIamPermissions`,
    method: 'POST', data: { permissions: PINNED_FULL_DEPLOY_PROJECT_PERMISSIONS }
  }));
  const serviceAccount = responseData(await request({
    url: `https://iam.googleapis.com/v1/projects/${BETA_PROJECT_ID}/serviceAccounts/${encodeURIComponent(BETA_APP_ENGINE_SERVICE_ACCOUNT)}:testIamPermissions`,
    method: 'POST', data: { permissions: ['iam.serviceAccounts.actAs'] }
  }));
  assert20260926PermissionPreflight({ projectPermissions: project.permissions || [], actAsPermissions: serviceAccount.permissions || [] });
  return { projectPermissions: project.permissions || [], actAsPermissions: serviceAccount.permissions || [] };
};
