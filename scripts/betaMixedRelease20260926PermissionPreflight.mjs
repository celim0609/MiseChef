import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BETA_APP_ENGINE_SERVICE_ACCOUNT, assert20260926PermissionPreflight } from './betaMixedRelease20260926Recovery.mjs';
import { BETA_PROJECT_ID, PINNED_FIREBASE_CLI_VERSION } from './betaDeploymentSafety.mjs';

const responseData = response => response?.data || response || {};
const DEPLOY_TARGETS = Object.freeze(['functions', 'hosting', 'firestore', 'storage']);
export const readPinnedFullDeployPermissionContract = firebaseToolsRoot => {
  const packageJson = JSON.parse(readFileSync(path.join(firebaseToolsRoot, 'package.json'), 'utf8'));
  if (packageJson.version !== PINNED_FIREBASE_CLI_VERSION) throw new Error(`Expected firebase-tools ${PINNED_FIREBASE_CLI_VERSION}; found ${packageJson.version || '(missing)'}.`);
  const firebaseRequire = createRequire(path.join(firebaseToolsRoot, 'package.json'));
  const { TARGET_PERMISSIONS } = firebaseRequire('./lib/commands/deploy.js');
  const source = readFileSync(path.join(firebaseToolsRoot, 'lib/commands/deploy.js'), 'utf8');
  const iamSource = readFileSync(path.join(firebaseToolsRoot, 'lib/deploy/functions/checkIam.js'), 'utf8');
  const grouped = Object.fromEntries(DEPLOY_TARGETS.map(target => [target, [...(TARGET_PERMISSIONS?.[target] || [])]]));
  const projectPermissions = ['firebase.projects.get', ...DEPLOY_TARGETS.flatMap(target => grouped[target])];
  if (DEPLOY_TARGETS.some(target => grouped[target].length === 0)
    || !source.includes('checkIam_1.checkServiceAccountIam)(options.project)')
    || !iamSource.includes('`${projectId}@appspot.gserviceaccount.com`')
    || !iamSource.includes('iam.serviceAccounts.actAs')) {
    throw new Error(`firebase-tools ${PINNED_FIREBASE_CLI_VERSION} permission contract differs from the protected full deploy preflight.`);
  }
  return { grouped, projectPermissions };
};

export const run20260926PermissionPreflight = async ({ request, firebaseToolsRoot }) => {
  const contract = readPinnedFullDeployPermissionContract(firebaseToolsRoot);
  const project = responseData(await request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${BETA_PROJECT_ID}:testIamPermissions`,
    method: 'POST', data: { permissions: contract.projectPermissions }
  }));
  const serviceAccount = responseData(await request({
    url: `https://iam.googleapis.com/v1/projects/${BETA_PROJECT_ID}/serviceAccounts/${encodeURIComponent(BETA_APP_ENGINE_SERVICE_ACCOUNT)}:testIamPermissions`,
    method: 'POST', data: { permissions: ['iam.serviceAccounts.actAs'] }
  }));
  const projectPermissions = project.permissions || []; const actAsPermissions = serviceAccount.permissions || [];
  assert20260926PermissionPreflight({ projectPermissions, actAsPermissions, requiredProjectPermissions: contract.projectPermissions });
  return {
    functions: contract.grouped.functions.every(permission => projectPermissions.includes(permission)),
    hosting: contract.grouped.hosting.every(permission => projectPermissions.includes(permission)),
    firestoreIndexes: contract.grouped.firestore.every(permission => projectPermissions.includes(permission)),
    firestoreStorageRules: contract.grouped.storage.every(permission => projectPermissions.includes(permission)),
    httpsFunctionIam: projectPermissions.includes('cloudfunctions.functions.setIamPolicy'),
    actAs: actAsPermissions.includes('iam.serviceAccounts.actAs'),
    projectPermissions, actAsPermissions, contract
  };
};
