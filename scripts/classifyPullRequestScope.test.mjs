import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  APPROVED_PRODUCTION_CONTROLLER_PATHS,
  assertControllerFilesPresent,
  assertValidationAggregate,
  classifyNameStatusZ,
  classifyPullRequestScope,
  classifyValidationEvent
} from './classifyPullRequestScope.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const encode = records => `${records.flat().join('\0')}\0`;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fakeGit = ({ output = '', failDiff = false } = {}) => (_root, args) => {
  if (args[0] === 'rev-parse') return `${args[2].slice(0, 40)}\n`;
  if (args[0] === 'diff' && failDiff) throw new Error('simulated git diff failure');
  if (args[0] === 'diff') return output;
  throw new Error(`Unexpected git command: ${args.join(' ')}`);
};

test('exact six approved controller files classify as production-controller-only', () => {
  const output = encode(APPROVED_PRODUCTION_CONTROLLER_PATHS.map(filePath => ['A', filePath]));
  const report = classifyNameStatusZ(output);
  assert.equal(report.scope, 'production-controller-only');
  assert.deepEqual(report.changedPaths, [...APPROVED_PRODUCTION_CONTROLLER_PATHS].sort());
});

test('an allowed controller subset classifies as production-controller-only', () => {
  const report = classifyNameStatusZ(encode([['M', 'scripts/deployProduction.mjs']]));
  assert.equal(report.scope, 'production-controller-only');
});

test('application-only changes classify as application', () => {
  const report = classifyNameStatusZ(encode([['M', 'src/App.tsx']]));
  assert.equal(report.scope, 'application');
});

test('controller and application changes classify as mixed', () => {
  const report = classifyNameStatusZ(encode([
    ['M', 'scripts/deployProduction.mjs'],
    ['M', 'functions/index.js']
  ]));
  assert.equal(report.scope, 'mixed');
});

test('deletion of an approved path remains controller-only but requires all controller files at validation time', () => {
  const report = classifyNameStatusZ(encode([['D', 'scripts/deployProduction.mjs']]));
  assert.equal(report.scope, 'production-controller-only');

  const root = mkdtempSync(path.join(os.tmpdir(), 'misechef-controller-scope-'));
  try {
    for (const filePath of APPROVED_PRODUCTION_CONTROLLER_PATHS) {
      mkdirSync(path.dirname(path.join(root, filePath)), { recursive: true });
      writeFileSync(path.join(root, filePath), 'fixture');
    }
    assert.doesNotThrow(() => assertControllerFilesPresent(root));
    unlinkSync(path.join(root, 'scripts/deployProduction.mjs'));
    assert.throws(() => assertControllerFilesPresent(root), /deployProduction\.mjs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deletion of a non-approved path classifies as application', () => {
  const report = classifyNameStatusZ(encode([['D', 'firestore.rules']]));
  assert.equal(report.scope, 'application');
});

test('rename into an approved path is expanded to delete plus add and classifies as mixed', () => {
  const report = classifyNameStatusZ(encode([
    ['R100', 'src/unsafe.mjs', 'scripts/deployProduction.mjs']
  ]));
  assert.equal(report.scope, 'mixed');
  assert.deepEqual(report.changedPaths, ['scripts/deployProduction.mjs', 'src/unsafe.mjs']);
});

test('rename out of an approved path is expanded to delete plus add and classifies as mixed', () => {
  const report = classifyNameStatusZ(encode([
    ['R087', 'scripts/deployProduction.mjs', 'scripts/deployAnything.mjs']
  ]));
  assert.equal(report.scope, 'mixed');
});

test('empty diff fails closed', () => {
  assert.equal(classifyNameStatusZ('').scope, 'invalid');
});

test('malformed status record fails closed', () => {
  assert.equal(classifyNameStatusZ('M\0').scope, 'invalid');
});

test('unknown status fails closed', () => {
  assert.equal(classifyNameStatusZ(encode([['Z', 'src/App.tsx']])).scope, 'invalid');
});

test('missing or invalid base SHA fails closed', () => {
  assert.equal(classifyPullRequestScope({ repositoryRoot: '.', headSha }).scope, 'invalid');
  assert.equal(classifyPullRequestScope({ repositoryRoot: '.', baseSha: 'main', headSha }).scope, 'invalid');
});

test('missing or invalid head SHA fails closed', () => {
  assert.equal(classifyPullRequestScope({ repositoryRoot: '.', baseSha }).scope, 'invalid');
  assert.equal(classifyPullRequestScope({ repositoryRoot: '.', baseSha, headSha: 'HEAD' }).scope, 'invalid');
});

test('git diff failure fails closed', () => {
  const report = classifyPullRequestScope({
    repositoryRoot: '.', baseSha, headSha, runGit: fakeGit({ failDiff: true })
  });
  assert.equal(report.scope, 'invalid');
  assert.match(report.reason, /git diff failure/);
});

test('valid exact SHAs classify the trusted git diff', () => {
  const report = classifyPullRequestScope({
    repositoryRoot: '.',
    baseSha,
    headSha,
    runGit: fakeGit({ output: encode([['M', 'src/App.tsx']]) })
  });
  assert.equal(report.scope, 'application');
});

test('workflow_dispatch always selects full Beta application validation without reading a diff', () => {
  const report = classifyValidationEvent({
    eventName: 'workflow_dispatch',
    runGit: () => { throw new Error('git must not run'); }
  });
  assert.equal(report.scope, 'application');
});

test('workflow routes workflow_dispatch application scope through the full Beta validator and final aggregator', () => {
  const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/validate-beta-candidate.yml'), 'utf8');
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(workflow, /needs\.classify_pr_scope\.outputs\.scope == 'application'/);
  assert.match(workflow, /name: full-beta-candidate-validation/);
  assert.match(workflow, /name: validate-beta-candidate/);
  assert.match(workflow, /--aggregate/);
});

test('final aggregation requires exactly the validator selected by trusted scope', () => {
  assert.doesNotThrow(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'success', scope: 'application',
    applicationResult: 'success', controllerResult: 'skipped'
  }));
  assert.doesNotThrow(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'success', scope: 'production-controller-only',
    applicationResult: 'skipped', controllerResult: 'success'
  }));
  assert.doesNotThrow(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'success', scope: 'mixed',
    applicationResult: 'success', controllerResult: 'success'
  }));
  assert.throws(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'success', scope: 'production-controller-only',
    applicationResult: 'skipped', controllerResult: 'skipped'
  }), /mismatch/);
  assert.throws(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'failure', scope: 'application',
    applicationResult: 'success', controllerResult: 'skipped'
  }), /classification/);
  assert.throws(() => assertValidationAggregate({
    gateResult: 'success', classifierResult: 'success', scope: 'invalid',
    applicationResult: 'skipped', controllerResult: 'skipped'
  }), /Invalid/);
});
