import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => execFileSync(command, args, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit'
});

const sourceTests = readdirSync(path.join(repositoryRoot, 'src'), { recursive: true })
  .filter(file => /\.test\.(ts|tsx)$/.test(file))
  .map(file => path.join('src', file))
  .sort();

run('npm', ['run', 'lint']);
run('npx', ['tsx', '--test', ...sourceTests]);
run('npm', ['--prefix', 'functions', 'test']);

try {
  run('java', ['-version']);
} catch {
  if (process.env.MISECHEF_BETA_VERIFY_ONLY === '1' && process.env.MISECHEF_BETA_ALLOW_MISSING_JAVA_FOR_VERIFY === '1') {
    console.warn('Java/emulator suites skipped only for non-deploy verification. A real Beta deployment will fail here.');
    process.exit(0);
  }
  throw new Error('Java is required for mandatory Beta Firestore/Storage Rules regression tests.');
}

run('npm', ['run', 'test:recipes:rules']);
run('npm', ['run', 'test:store-payments:rules']);
console.log('All protected Beta integration suites passed.');
