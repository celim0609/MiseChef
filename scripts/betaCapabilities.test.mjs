import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  discoverFirebaseFunctions,
  readProtectedContract,
  validateBetaCapabilities,
  validateTrustedGate
} from './betaCapabilities.mjs';

const trustedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = value => JSON.parse(JSON.stringify(value));
const removalFor = capabilityId => ({
  schemaVersion: 1,
  removals: [{
    capabilityId,
    approved: true,
    reason: 'Product retirement approved for the next release.',
    approvedBy: 'beta-release-reviewer',
    approvedAt: '2026-08-26T00:00:00.000Z',
    reviewReference: 'MCR-1000',
    targetRelease: 17
  }]
});

const fixtureContract = () => ({
  schemaVersion: 1,
  contractId: 'fixture-release-16',
  baseline: { release: 16, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), projectId: 'demo' },
  capabilities: [{
    id: 'fixture.capability',
    requires: ['module.fixture', 'function.fixtureFunction', 'firestore.fixture', 'storage.fixture', 'index.fixture', 'hosting.fixture', 'route.fixture', 'nav.fixture']
  }],
  sourceModules: [{ id: 'module.fixture', file: 'src/Feature.ts', identifiers: ['Feature'], reachable: true }],
  cloudFunctions: ['fixtureFunction'],
  firestoreCapabilities: [{ id: 'firestore.fixture', match: '/fixtures/{fixtureId}', requires: ['allow read'] }],
  storageCapabilities: [{ id: 'storage.fixture', path: '/fixtures/{fixtureId}' }],
  indexes: [{ id: 'index.fixture', collectionGroup: 'fixtures', queryScope: 'COLLECTION', fields: [{ fieldPath: 'createdAt', order: 'DESCENDING' }] }],
  hostingRewrites: [{ id: 'hosting.fixture', source: '**', destination: '/index.html' }],
  routes: [{ id: 'route.fixture', file: 'src/Feature.ts', kind: 'literal', value: '/fixture' }],
  navigation: [{ id: 'nav.fixture', file: 'src/Feature.ts', kind: 'expression', value: 'NAV.fixture' }]
});

const writeFixture = ({
  functionSource = 'export const fixtureFunction = onCall({}, () => null);',
  featureSource = "export const Feature = '/fixture'; export const NAV = { fixture: 'fixture' }; export const selected = NAV.fixture;",
  firestoreRules = 'match /fixtures/{fixtureId} { allow read: if true; }',
  storageRules = 'match /fixtures/{fixtureId} { allow read: if true; }',
  indexes,
  rewrites,
  contract,
  candidateAuthority,
  candidateRemovals
} = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), 'misechef-capabilities-'));
  mkdirSync(path.join(root, 'config'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'functions'), { recursive: true });
  writeFileSync(path.join(root, 'src/main.tsx'), "import './Feature';");
  writeFileSync(path.join(root, 'src/Feature.ts'), featureSource);
  writeFileSync(path.join(root, 'functions/index.js'), functionSource);
  writeFileSync(path.join(root, 'firestore.rules'), firestoreRules);
  writeFileSync(path.join(root, 'storage.rules'), storageRules);
  writeFileSync(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: indexes ?? [{ collectionGroup: 'fixtures', queryScope: 'COLLECTION', fields: [{ fieldPath: 'createdAt', order: 'DESCENDING' }] }] }));
  writeFileSync(path.join(root, 'firebase.json'), JSON.stringify({ hosting: { rewrites: rewrites ?? [{ source: '**', destination: '/index.html' }] } }));
  if (contract) writeFileSync(path.join(root, 'config/beta-capabilities.json'), JSON.stringify(contract));
  if (candidateAuthority) writeFileSync(path.join(root, 'config/beta-capability-authority.json'), JSON.stringify(candidateAuthority));
  if (candidateRemovals) writeFileSync(path.join(root, 'config/beta-capability-removals.json'), JSON.stringify(candidateRemovals));
  return root;
};

const validateFixture = (root, contract, protectedContract = contract, removals = { schemaVersion: 1, removals: [] }) =>
  validateBetaCapabilities({ candidateRoot: root, trustedRoot, contract, protectedContract, removals });

test('trusted gate resolves the immutable Release #16 contract without application source', () => {
  const result = validateTrustedGate({ trustedRoot });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.authorityCommit, '472a4a8412ff97a726b902f94cfa703dc7bbad0d');
  assert.equal(result.baselineCommit, '06a37c0d30c47e037994454119a0461955df4ee3');
});

test('the trusted contract prevents a candidate from hiding deletion in its manifest', () => {
  const protectedContract = fixtureContract();
  const candidate = clone(protectedContract);
  candidate.cloudFunctions = [];
  const root = writeFixture({ contract: candidate, functionSource: '' });
  const result = validateBetaCapabilities({ candidateRoot: root, trustedRoot, protectedContract });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /function\.fixtureFunction: deleted from candidate cloudFunctions contract/);
});

test('the candidate cannot casually repoint the accepted authority commit', () => {
  assert.throws(
    () => readProtectedContract(trustedRoot, {
      schemaVersion: 1,
      contractCommit: 'f'.repeat(40),
      contractPath: 'config/beta-capabilities.json'
    }),
    /does not match the mandatory accepted authority/
  );
});

test('candidate authority and removal files cannot approve their own protected deletion', () => {
  const protectedContract = fixtureContract();
  const candidate = clone(protectedContract);
  candidate.cloudFunctions = [];
  const root = writeFixture({
    contract: candidate,
    functionSource: '',
    candidateAuthority: { schemaVersion: 1, contractCommit: 'f'.repeat(40), contractPath: 'config/beta-capabilities.json' },
    candidateRemovals: removalFor('function.fixtureFunction')
  });
  const result = validateBetaCapabilities({ candidateRoot: root, trustedRoot, protectedContract });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /function\.fixtureFunction/);
});

test('Firebase Function discovery uses exported builder-call AST nodes, not strings or comments', () => {
  const source = `
    // export const commentSpoof = onCall({}, handler);
    const marker = "export const stringSpoof = onRequest({}, handler)";
    export const realCallable = onCall({}, handler);
    export const realHttp = https.onRequest({}, handler);
    export const unrelated = helper({}, handler);
    const notExported = onSchedule('* * * * *', handler);
  `;
  assert.deepEqual(discoverFirebaseFunctions(source), ['realCallable', 'realHttp']);
});

test('additive Functions, routes, indexes, and Hosting rewrites are allowed', () => {
  const protectedContract = fixtureContract();
  const extraIndex = { collectionGroup: 'fixtures', queryScope: 'COLLECTION', fields: [{ fieldPath: 'name', order: 'ASCENDING' }] };
  const extraRewrite = { source: '/new/**', destination: '/new.html' };
  const root = writeFixture({
    functionSource: 'export const fixtureFunction = onCall({}, handler); export const newFunction = onRequest({}, handler);',
    featureSource: "export const Feature = '/fixture'; export const newRoute = '/new'; export const NAV = { fixture: 'fixture' }; export const selected = NAV.fixture;",
    indexes: [{ collectionGroup: 'fixtures', queryScope: 'COLLECTION', fields: [{ fieldPath: 'createdAt', order: 'DESCENDING' }] }, extraIndex],
    rewrites: [extraRewrite, { source: '**', destination: '/index.html' }]
  });
  const result = validateFixture(root, protectedContract);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.additions.functions, ['newFunction']);
});

test('deleting a protected Function fails without an approved removal', () => {
  const contract = fixtureContract();
  const root = writeFixture({ functionSource: 'export const otherFunction = onCall({}, handler);' });
  const result = validateFixture(root, contract);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /function\.fixtureFunction/);
});

test('an exact reviewed removal permits intentional deletion', () => {
  const protectedContract = fixtureContract();
  const candidate = clone(protectedContract);
  candidate.cloudFunctions = [];
  const root = writeFixture({ functionSource: '' });
  const result = validateFixture(root, candidate, protectedContract, removalFor('function.fixtureFunction'));
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.acceptedRemovals, ['function.fixtureFunction']);
});

test('malformed, unapproved, duplicate, and stale removal records fail', () => {
  const contract = fixtureContract();
  const root = writeFixture();
  const malformed = { schemaVersion: 1, removals: [{ capabilityId: 'function.fixtureFunction', approved: false }] };
  assert.match(validateFixture(root, contract, contract, malformed).errors.join('\n'), /malformed or unapproved/);
  assert.match(validateFixture(root, contract, contract, removalFor('function.fixtureFunction')).errors.join('\n'), /stale/);
  const duplicate = removalFor('function.fixtureFunction');
  duplicate.removals.push(clone(duplicate.removals[0]));
  assert.match(validateFixture(root, contract, contract, duplicate).errors.join('\n'), /duplicates removal record/);
});

test('source, route, Storage, index, and Hosting regressions are each rejected', () => {
  const contract = fixtureContract();
  const cases = [
    { options: { featureSource: "export const NAV = { fixture: 'fixture' }; export const selected = NAV.fixture;" }, pattern: /module\.fixture/ },
    { options: { featureSource: "export const Feature = 'changed'; export const NAV = { fixture: 'fixture' }; export const selected = NAV.fixture;" }, pattern: /route\.fixture/ },
    { options: { storageRules: 'match /other/{id} { allow read: if true; }' }, pattern: /storage\.fixture/ },
    { options: { indexes: [] }, pattern: /index\.fixture/ },
    { options: { rewrites: [] }, pattern: /hosting\.fixture/ }
  ];
  for (const { options, pattern } of cases) {
    const result = validateFixture(writeFixture(options), contract);
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), pattern);
  }
});
