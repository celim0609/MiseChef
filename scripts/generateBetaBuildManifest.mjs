import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MANDATORY_BETA_BASELINE,
  extractEntryAsset,
  sha256File
} from './betaDeploymentSafety.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const sourceCommit = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
const distIndex = await readFile(path.join(repositoryRoot, 'dist', 'index.html'), 'utf8');
const storeShell = await readFile(path.join(repositoryRoot, 'functions', 'generated', 'publicStoreAppShell.html'), 'utf8');
const entryAsset = extractEntryAsset(distIndex);
const storeShellAsset = extractEntryAsset(storeShell);

if (entryAsset !== storeShellAsset) {
  throw new Error(`Cannot create Beta manifest: Hosting uses ${entryAsset}, Store shell uses ${storeShellAsset}.`);
}

const manifest = {
  kind: 'misechef-beta-release',
  version: 1,
  buildId: randomUUID(),
  builtAt: new Date().toISOString(),
  sourceCommit,
  sourceTree,
  protectedBaseline: process.env.MISECHEF_BETA_PROTECTED_BASELINE || MANDATORY_BETA_BASELINE,
  entryAsset,
  entryAssetSha256: sha256File(path.join(repositoryRoot, 'dist', entryAsset.replace(/^\//, ''))),
  storeShellAsset
};

const outputDirectory = path.join(repositoryRoot, 'dist', '.well-known');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'misechef-beta-release.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
console.log(`Prepared Beta build manifest for ${sourceCommit}: ${entryAsset}`);
