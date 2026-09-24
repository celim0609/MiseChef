import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const value = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? path.resolve(process.argv[index + 1] || '') : '';
};
const recoveryRoot = value('--recovery-root');
const trustedRoot = value('--trusted-root');
const candidateRoot = value('--candidate-root');
const requiredRoots = [
  [recoveryRoot, 'recovery-gate'], [trustedRoot, 'trusted-gate'], [candidateRoot, 'candidate'],
  [path.join(candidateRoot, 'functions'), 'candidate/functions']
];
for (const [root, label] of requiredRoots) if (!root || !existsSync(root)) throw new Error(`CI-equivalent preflight requires ${label}.`);
const candidateRequire = createRequire(path.join(candidateRoot, 'functions', 'package.json'));
const googleAuthPath = candidateRequire.resolve('google-auth-library');
const { GoogleAuth } = candidateRequire('google-auth-library');
if (typeof GoogleAuth !== 'function' || !googleAuthPath.startsWith(path.join(candidateRoot, 'functions', 'node_modules'))) throw new Error('google-auth-library must resolve from candidate/functions/node_modules.');
const globalNpmRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
const firebaseToolsRoot = path.join(globalNpmRoot, 'firebase-tools');
if (!existsSync(path.join(firebaseToolsRoot, 'package.json'))) throw new Error('Pinned global firebase-tools is unavailable.');
const firebaseRequire = createRequire(path.join(firebaseToolsRoot, 'package.json'));
for (const dependency of ['./lib/deploy/storage/prepare.js', './lib/requireAuth.js', './lib/apiv2.js', './lib/api.js']) {
  const resolved = firebaseRequire.resolve(dependency);
  if (!resolved.startsWith(firebaseToolsRoot)) throw new Error(`firebase-tools dependency escaped the pinned installation: ${dependency}`);
}
for (const file of ['recoverBetaMixedRelease20260925.mjs', 'betaDurableLiveRelease.mjs', 'validateBetaMixedRelease20260925Predeploy.mjs']) {
  const filePath = path.join(recoveryRoot, 'scripts', file);
  if (!existsSync(filePath)) throw new Error(`Missing recovery runtime module: ${file}`);
  execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
  if (file !== 'betaDurableLiveRelease.mjs' && !readFileSync(filePath, 'utf8').includes('candidateRequire')) throw new Error(`Recovery runtime module does not preserve candidate dependency resolution: ${file}`);
}
console.log('CI-equivalent 20260925 recovery import preflight passed without marker or Firebase deploy actions.');
