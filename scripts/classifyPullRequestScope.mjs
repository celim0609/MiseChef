import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APPROVED_PRODUCTION_CONTROLLER_PATHS = Object.freeze([
  '.github/workflows/deploy-production.yml',
  'scripts/deployProduction.mjs',
  'scripts/productionDeploymentSafety.mjs',
  'scripts/productionDeploymentSafety.test.mjs',
  'scripts/productionLiveRelease.mjs',
  'scripts/validateProductionPredeploy.mjs'
]);

const EXACT_SHA = /^[0-9a-f]{40}$/;
const SINGLE_PATH_STATUSES = new Set(['A', 'D', 'M', 'T']);
const TWO_PATH_STATUS = /^[RC]([0-9]{1,3})$/;

const invalid = reason => ({ scope: 'invalid', changedPaths: [], reason });

const validatePath = value => {
  if (!value || value.startsWith('/') || value.split('/').includes('..')) {
    throw new Error(`Invalid changed path: ${value || '<empty>'}`);
  }
  return value;
};

export const parseNameStatusZ = output => {
  if (typeof output !== 'string') throw new Error('Git diff output must be a string.');
  if (output === '') return [];
  if (!output.endsWith('\0')) throw new Error('Git diff output is not NUL terminated.');

  const tokens = output.split('\0');
  tokens.pop();
  const entries = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (SINGLE_PATH_STATUSES.has(status)) {
      if (index >= tokens.length) throw new Error(`Malformed ${status} status record.`);
      entries.push({ status, path: validatePath(tokens[index++]) });
      continue;
    }
    const twoPathMatch = status.match(TWO_PATH_STATUS);
    if (twoPathMatch && Number(twoPathMatch[1]) <= 100) {
      if (index + 1 >= tokens.length) throw new Error(`Malformed ${status} status record.`);
      const from = validatePath(tokens[index++]);
      const to = validatePath(tokens[index++]);
      entries.push({ status: 'D', path: from }, { status: 'A', path: to });
      continue;
    }
    throw new Error(`Unknown git diff status: ${status || '<empty>'}`);
  }

  return entries;
};

export const classifyEntries = entries => {
  if (!Array.isArray(entries) || entries.length === 0) return invalid('The PR diff is empty.');
  const approved = new Set(APPROVED_PRODUCTION_CONTROLLER_PATHS);
  const changedPaths = [...new Set(entries.map(entry => validatePath(entry.path)))].sort();
  const controllerPaths = changedPaths.filter(filePath => approved.has(filePath));
  const otherPaths = changedPaths.filter(filePath => !approved.has(filePath));

  if (controllerPaths.length > 0 && otherPaths.length === 0) {
    return { scope: 'production-controller-only', changedPaths, reason: '' };
  }
  if (controllerPaths.length > 0 && otherPaths.length > 0) {
    return { scope: 'mixed', changedPaths, reason: '' };
  }
  if (controllerPaths.length === 0 && otherPaths.length > 0) {
    return { scope: 'application', changedPaths, reason: '' };
  }
  return invalid('Unable to classify the PR diff.');
};

export const classifyNameStatusZ = output => {
  try {
    return classifyEntries(parseNameStatusZ(output));
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }
};

const defaultRunGit = (repositoryRoot, args) => execFileSync('git', args, {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});

export const classifyPullRequestScope = ({ repositoryRoot, baseSha, headSha, runGit = defaultRunGit } = {}) => {
  if (!EXACT_SHA.test(baseSha || '')) return invalid('Base SHA must be an exact lowercase 40-character Git SHA.');
  if (!EXACT_SHA.test(headSha || '')) return invalid('Head SHA must be an exact lowercase 40-character Git SHA.');
  if (!repositoryRoot) return invalid('Repository root is required.');

  try {
    for (const [label, sha] of [['base', baseSha], ['head', headSha]]) {
      const resolved = runGit(repositoryRoot, ['rev-parse', '--verify', `${sha}^{commit}`]).trim();
      if (resolved !== sha) return invalid(`${label} SHA did not resolve exactly.`);
    }
    const output = runGit(repositoryRoot, [
      'diff', '--name-status', '--no-renames', '-z', `${baseSha}...${headSha}`, '--'
    ]);
    return classifyNameStatusZ(output);
  } catch (error) {
    return invalid(`Unable to read the trusted base/head diff: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const classifyValidationEvent = ({ eventName, ...options } = {}) => {
  if (eventName === 'workflow_dispatch') {
    return { scope: 'application', changedPaths: [], reason: 'Manual validation always runs the full Beta gate.' };
  }
  if (eventName !== 'pull_request') return invalid(`Unsupported validation event: ${eventName || '<empty>'}`);
  return classifyPullRequestScope(options);
};

export const assertControllerFilesPresent = candidateRoot => {
  if (!candidateRoot) throw new Error('Candidate root is required for controller validation.');
  const missing = APPROVED_PRODUCTION_CONTROLLER_PATHS
    .filter(filePath => {
      const absolute = path.join(candidateRoot, filePath);
      if (!existsSync(absolute)) return true;
      const status = lstatSync(absolute);
      return status.isSymbolicLink() || !status.isFile();
    });
  if (missing.length > 0) throw new Error(`Production controller files are missing:\n- ${missing.join('\n- ')}`);
};

export const assertValidationAggregate = ({
  gateResult,
  classifierResult,
  scope,
  applicationResult,
  controllerResult
} = {}) => {
  if (gateResult !== 'success') throw new Error(`Gate integrity did not succeed: ${gateResult || '<empty>'}`);
  if (classifierResult !== 'success') throw new Error(`PR scope classification did not succeed: ${classifierResult || '<empty>'}`);
  const expected = {
    application: ['success', 'skipped'],
    'production-controller-only': ['skipped', 'success'],
    mixed: ['success', 'success']
  }[scope];
  if (!expected) throw new Error(`Invalid or missing trusted PR validation scope: ${scope || '<empty>'}`);
  if (applicationResult !== expected[0] || controllerResult !== expected[1]) {
    throw new Error(
      `Validation result mismatch for ${scope}: application=${applicationResult || '<empty>'}, controller=${controllerResult || '<empty>'}`
    );
  }
};

const readArgument = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--aggregate')) {
    assertValidationAggregate({
      gateResult: readArgument(args, '--gate-result'),
      classifierResult: readArgument(args, '--classifier-result'),
      scope: readArgument(args, '--scope'),
      applicationResult: readArgument(args, '--application-result'),
      controllerResult: readArgument(args, '--controller-result')
    });
    console.log('Required PR validation result set passed.');
  } else {
    const eventName = readArgument(args, '--event');
    const repositoryRoot = path.resolve(readArgument(args, '--repository') || '.');
    const candidateRoot = path.resolve(readArgument(args, '--candidate-root') || repositoryRoot);
    const report = classifyValidationEvent({
      eventName,
      repositoryRoot,
      baseSha: readArgument(args, '--base'),
      headSha: readArgument(args, '--head')
    });

    if (report.scope === 'production-controller-only' || report.scope === 'mixed') {
      assertControllerFilesPresent(candidateRoot);
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `scope=${report.scope}\nchanged_count=${report.changedPaths.length}\n`);
    }
    if (report.scope === 'invalid') throw new Error(`PR scope classification failed closed: ${report.reason}`);
    console.log(`PR validation scope: ${report.scope}`);
    console.log(`Changed paths: ${report.changedPaths.length}`);
  }
}
