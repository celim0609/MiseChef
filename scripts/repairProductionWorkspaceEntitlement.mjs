#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ID = 'misechef-fa4bf';
const OWNER_UID = 'stShXwdbIzOh14ItTtQ4hRB5oBz1';
const WORKSPACE_ID = OWNER_UID;
const ACCOUNT_EMAIL = 'celim0609@gmail.com';
const CONFIRMATION = 'REPAIR PRODUCTION WORKSPACE ENTITLEMENT';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirmIndex = args.indexOf('--confirm');
const confirmation = confirmIndex >= 0 ? args[confirmIndex + 1] : '';

const loadFirebaseTools = () => {
  const roots = [process.env.FIREBASE_TOOLS_MODULE_ROOT, '/usr/local/lib/node_modules/firebase-tools', '/opt/homebrew/lib/node_modules/firebase-tools'].filter(Boolean);
  let lastError;
  for (const root of roots) {
    try { return { Client: require(`${root}/lib/apiv2`).Client, auth: require(`${root}/lib/auth`) }; }
    catch (error) { lastError = error; }
  }
  throw new Error(`firebase-tools is required. ${lastError?.message || ''}`);
};

const { Client, auth } = loadFirebaseTools();
const account = auth.getAllAccounts().find(candidate => candidate.user?.email === ACCOUNT_EMAIL);
assert(account, `Authenticated Firebase CLI account ${ACCOUNT_EMAIL} was not found.`);
auth.setActiveAccount({}, account);

const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
const base = `/projects/${PROJECT_ID}/databases/(default)`;
const docPath = path => `${base}/documents/${path}`;
const get = async path => (await firestore.get(docPath(path))).body;
const read = (doc, field) => doc?.fields?.[field]?.stringValue || '';

const [workspace, company, membership] = await Promise.all([
  get(`workspaces/${WORKSPACE_ID}`),
  get(`companies/${WORKSPACE_ID}`),
  get(`workspaceMembers/${WORKSPACE_ID}_${OWNER_UID}`)
]);

assert.equal(read(workspace, 'ownerId'), OWNER_UID, 'Workspace owner mismatch.');
assert.equal(read(workspace, 'country'), 'MY', 'Workspace country is not MY.');
assert.equal(read(membership, 'workspaceId'), WORKSPACE_ID, 'Canonical membership workspace mismatch.');
assert.equal(read(membership, 'userId'), OWNER_UID, 'Canonical membership user mismatch.');
assert.equal(read(membership, 'status'), 'Active', 'Canonical membership is not Active.');
assert.equal(read(membership, 'role'), 'Owner', 'Canonical membership is not Owner.');
assert.equal(read(company, 'ownerId'), OWNER_UID, 'Company owner mismatch.');
assert.equal(read(company, 'subscriptionPlan'), 'professional', 'Company plan is not professional.');
assert.equal(read(company, 'subscriptionStatus'), 'active', 'Company subscription is not active.');
assert.equal(read(workspace, 'subscriptionPlan'), 'free', 'Workspace plan changed since diagnosis; refusing repair.');
assert.equal(read(workspace, 'subscriptionStatus'), 'suspended', 'Workspace status changed since diagnosis; refusing repair.');
assert.ok(workspace.updateTime, 'Workspace updateTime missing; refusing unprotected write.');

const before = {
  workspace: { subscriptionPlan: read(workspace, 'subscriptionPlan'), subscriptionStatus: read(workspace, 'subscriptionStatus'), updateTime: workspace.updateTime },
  authoritativeCompany: { subscriptionPlan: read(company, 'subscriptionPlan'), subscriptionStatus: read(company, 'subscriptionStatus') }
};

if (!apply) {
  console.log(JSON.stringify({ mode: 'DRY_RUN', safeToApply: true, before, plannedPatch: { subscriptionPlan: 'professional', subscriptionStatus: 'active' }, confirmation: CONFIRMATION }, null, 2));
  process.exit(0);
}

assert.equal(confirmation, CONFIRMATION, `Apply requires --confirm "${CONFIRMATION}".`);

const write = {
  update: {
    name: workspace.name,
    fields: {
      subscriptionPlan: { stringValue: 'professional' },
      subscriptionStatus: { stringValue: 'active' }
    }
  },
  updateMask: { fieldPaths: ['subscriptionPlan', 'subscriptionStatus'] },
  currentDocument: { updateTime: workspace.updateTime }
};

await firestore.post(`${base}/documents:commit`, { writes: [write] });

const verified = await get(`workspaces/${WORKSPACE_ID}`);
assert.equal(read(verified, 'subscriptionPlan'), 'professional', 'Post-write workspace plan verification failed.');
assert.equal(read(verified, 'subscriptionStatus'), 'active', 'Post-write workspace status verification failed.');
assert.equal(read(verified, 'ownerId'), OWNER_UID, 'Post-write owner changed unexpectedly.');
assert.equal(read(verified, 'country'), 'MY', 'Post-write country changed unexpectedly.');

console.log(JSON.stringify({
  mode: 'APPLY',
  success: true,
  changedFields: ['subscriptionPlan', 'subscriptionStatus'],
  before,
  after: { subscriptionPlan: read(verified, 'subscriptionPlan'), subscriptionStatus: read(verified, 'subscriptionStatus'), updateTime: verified.updateTime }
}, null, 2));
