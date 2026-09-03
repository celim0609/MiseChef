#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PROJECT_ID = 'misechef-fa4bf';
const OWNER_UID = 'stShXwdbIzOh14ItTtQ4hRB5oBz1';
const EXPECTED_WORKSPACE_ID = OWNER_UID;
const ACCOUNT_EMAIL = 'celim0609@gmail.com';

const loadFirebaseTools = () => {
  const roots = [
    process.env.FIREBASE_TOOLS_MODULE_ROOT,
    '/usr/local/lib/node_modules/firebase-tools',
    '/opt/homebrew/lib/node_modules/firebase-tools'
  ].filter(Boolean);
  let lastError;
  for (const root of roots) {
    try {
      return {
        Client: require(`${root}/lib/apiv2`).Client,
        auth: require(`${root}/lib/auth`)
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`firebase-tools is required. ${lastError?.message || ''}`);
};

const { Client, auth } = loadFirebaseTools();
const account = auth.getAllAccounts().find(candidate => candidate.user?.email === ACCOUNT_EMAIL);
assert(account, `Authenticated Firebase CLI account ${ACCOUNT_EMAIL} was not found.`);
auth.setActiveAccount({}, account);

const firestore = new Client({
  urlPrefix: 'https://firestore.googleapis.com',
  apiVersion: 'v1',
  auth: true
});

const firestorePath = path => `/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;

const getDocument = async path => {
  try {
    return (await firestore.get(firestorePath(path))).body;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
};

const listCollection = async collection => {
  const documents = [];
  let pageToken;
  do {
    const response = await firestore.get(firestorePath(collection), {
      queryParams: { pageSize: '1000', ...(pageToken ? { pageToken } : {}) }
    });
    documents.push(...(response.body.documents || []));
    pageToken = response.body.nextPageToken;
  } while (pageToken);
  return documents;
};

const value = field => {
  if (!field) return null;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('timestampValue' in field) return field.timestampValue;
  return '[complex]';
};

const pick = (doc, fields) => {
  if (!doc) return null;
  return Object.fromEntries(fields.map(name => [name, value(doc.fields?.[name])]));
};

const idOf = doc => doc?.name?.split('/').pop() || '';

const [user, workspace, company, hostProfile, recipes, memberships, stores] = await Promise.all([
  getDocument(`users/${OWNER_UID}`),
  getDocument(`workspaces/${EXPECTED_WORKSPACE_ID}`),
  getDocument(`companies/${EXPECTED_WORKSPACE_ID}`),
  getDocument(`hostProfiles/${OWNER_UID}`),
  listCollection('recipes'),
  listCollection('workspaceMembers'),
  listCollection('stores')
]);

const ownerMemberships = memberships.filter(doc => value(doc.fields?.userId) === OWNER_UID);
const workspaceRecipes = recipes.filter(doc => value(doc.fields?.workspaceId) === EXPECTED_WORKSPACE_ID);
const workspaceStores = stores.filter(doc => value(doc.fields?.workspaceId) === EXPECTED_WORKSPACE_ID || idOf(doc) === EXPECTED_WORKSPACE_ID);

const report = {
  mode: 'READ_ONLY',
  projectId: PROJECT_ID,
  authenticatedAccount: ACCOUNT_EMAIL,
  expectedOwnerUid: OWNER_UID,
  expectedWorkspaceId: EXPECTED_WORKSPACE_ID,
  user: pick(user, ['companyId', 'companyRole', 'role', 'email']),
  workspace: pick(workspace, ['name', 'ownerId', 'country', 'subscriptionPlan', 'subscriptionStatus']),
  company: pick(company, ['name', 'ownerId', 'subscriptionPlan', 'subscriptionStatus', 'billingCycle']),
  workspaceMembershipsForOwner: ownerMemberships.map(doc => ({
    id: idOf(doc),
    ...pick(doc, ['workspaceId', 'userId', 'role', 'status', 'workspaceName', 'email'])
  })),
  hostProfile: pick(hostProfile, ['userId', 'status']),
  recipeCountForExpectedWorkspace: workspaceRecipes.length,
  recipeSample: workspaceRecipes.slice(0, 5).map(doc => ({
    id: idOf(doc),
    ...pick(doc, ['name', 'workspaceId', 'companyId', 'userId', 'createdBy'])
  })),
  storesForExpectedWorkspace: workspaceStores.map(doc => ({
    id: idOf(doc),
    ...pick(doc, ['name', 'workspaceId', 'companyId', 'country', 'currency'])
  }))
};

report.diagnosis = {
  userExists: Boolean(user),
  workspaceExists: Boolean(workspace),
  companyExists: Boolean(company),
  canonicalOwnerMembershipExists: ownerMemberships.some(doc =>
    idOf(doc) === `${EXPECTED_WORKSPACE_ID}_${OWNER_UID}`
    && value(doc.fields?.workspaceId) === EXPECTED_WORKSPACE_ID
    && value(doc.fields?.status) === 'Active'
  ),
  workspaceOwnerMatches: value(workspace?.fields?.ownerId) === OWNER_UID,
  companyEntitlementActive: ['active', 'trialing'].includes(String(value(company?.fields?.subscriptionStatus) || '').toLowerCase())
    && ['starter', 'professional', 'business', 'internal_unlimited'].includes(String(value(company?.fields?.subscriptionPlan) || '').toLowerCase()),
  recipesPresent: workspaceRecipes.length > 0,
  hostProfileExists: Boolean(hostProfile),
  storePresent: workspaceStores.length > 0
};

console.log(JSON.stringify(report, null, 2));
