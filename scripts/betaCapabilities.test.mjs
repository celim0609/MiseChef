import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverFirebaseFunctions, validateBetaCapabilities } from './betaCapabilities.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  rewrites
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
  return root;
};

const validateFixture = (root, contract, protectedContract = contract, removals = { schemaVersion: 1, removals: [] }) =>
  validateBetaCapabilities({ repositoryRoot: root, contract, protectedContract, removals });

test('the repository satisfies the protected Release #16 capability contract', () => {
  const result = validateBetaCapabilities({ repositoryRoot });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.counts.protectedFunctions, 35);
  assert.equal(result.counts.discoveredFunctions, 39);
});

test('the authority commit prevents a candidate from hiding deletion in its manifest', () => {
  const candidate = JSON.parse(readFileSync(path.join(repositoryRoot, 'config/beta-capabilities.json'), 'utf8'));
  candidate.cloudFunctions = candidate.cloudFunctions.filter(name => name !== 'activateMiseChefHost');
  const result = validateBetaCapabilities({ repositoryRoot, contract: candidate });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /function\.activateMiseChefHost: deleted from candidate cloudFunctions contract/);
});

test('the candidate cannot casually repoint the accepted authority commit', () => {
  assert.throws(
    () => validateBetaCapabilities({
      repositoryRoot,
      authority: { schemaVersion: 1, contractCommit: 'f'.repeat(40), contractPath: 'config/beta-capabilities.json' }
    }),
    /does not match the mandatory accepted authority/
  );
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
