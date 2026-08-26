import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readGateRoots } from './betaGateCli.mjs';

const { trustedRoot, candidateRoot } = readGateRoots();
const run = (command, args, cwd = candidateRoot) => execFileSync(command, args, {
  cwd,
  env: process.env,
  stdio: 'inherit'
});

const candidateBinary = name => path.join(candidateRoot, 'node_modules', '.bin', name);
const sourceTests = readdirSync(path.join(candidateRoot, 'src'), { recursive: true })
  .filter(file => /\.test\.(ts|tsx)$/.test(file))
  .map(file => path.join('src', file))
  .sort();
const functionTests = readdirSync(path.join(candidateRoot, 'functions'))
  .filter(file => file.endsWith('.test.js'))
  .sort();

console.log(`Trusted gate root: ${trustedRoot}`);
console.log(`Candidate root: ${candidateRoot}`);

run(process.execPath, [
  path.join(trustedRoot, 'scripts', 'validateBetaCapabilities.mjs'),
  '--trusted-root', trustedRoot,
  '--candidate-root', candidateRoot
], trustedRoot);

console.log('Running candidate TypeScript validation.');
run(candidateBinary('tsc'), ['--noEmit']);

console.log(`Running ${sourceTests.length} candidate frontend/model test files.`);
run(candidateBinary('tsx'), ['--test', ...sourceTests]);

console.log(`Running ${functionTests.length} candidate Functions test files.`);
run(process.execPath, ['--test', ...functionTests], path.join(candidateRoot, 'functions'));

console.log('Verifying mandatory Java runtime.');
run('java', ['-version']);

const rulesSuites = [
  {
    label: 'Recipe Rules',
    only: 'firestore',
    project: 'demo-misechef-recipe-rules',
    tests: ['tests/recipeWorkspaceAccessControl.test.mjs']
  },
  {
    label: 'Resume Import Rules',
    only: 'firestore',
    project: 'demo-misechef-resume-import-rules',
    tests: ['tests/resumeImportJobAccessControl.test.mjs']
  },
  {
    label: 'Chef Profile Rules',
    only: 'firestore,storage',
    project: 'demo-misechef-chef-profile-rules',
    tests: ['tests/chefProfileAccessControl.test.mjs']
  },
  {
    label: 'Personal Expenses Rules',
    only: 'firestore,storage',
    project: 'demo-misechef-personal-expense-rules',
    tests: ['tests/personalExpenseAccessControl.test.mjs']
  },
  {
    label: 'Store Payment / Order Rules',
    only: 'firestore,storage',
    project: 'demo-misechef-store-payment-rules',
    tests: ['tests/storePaymentAccessControl.test.mjs', 'tests/storeOrderHistoryIntegration.test.mjs']
  }
];

for (const suite of rulesSuites) {
  console.log(`Running mandatory candidate suite: ${suite.label}`);
  const testCommand = ['node', '--test', ...suite.tests].join(' ');
  run('firebase', [
    'emulators:exec',
    '--only', suite.only,
    '--project', suite.project,
    testCommand
  ]);
  console.log(`PASS: ${suite.label}`);
}

console.log('All protected candidate regression suites passed with no skips.');
