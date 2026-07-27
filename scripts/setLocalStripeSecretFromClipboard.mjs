import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const fields = {
  secret: {
    environmentName: 'STRIPE_SECRET_KEY',
    pattern: /^sk_test_[A-Za-z0-9]+$/
  },
  webhook: {
    environmentName: 'STRIPE_WEBHOOK_SECRET',
    pattern: /^whsec_[A-Za-z0-9]+$/
  }
};

const requestedField = fields[process.argv[2]];
if (!requestedField) {
  console.error('Choose either "secret" or "webhook".');
  process.exit(1);
}

const clipboardValue = execFileSync('pbpaste', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore']
}).trim();

if (!requestedField.pattern.test(clipboardValue)) {
  console.error(`Clipboard does not contain a valid ${requestedField.environmentName} value.`);
  process.exit(1);
}

const secretFile = fileURLToPath(
  new URL('../functions/.secret.local', import.meta.url)
);
const original = readFileSync(secretFile, 'utf8');
const assignment = `${requestedField.environmentName}="${clipboardValue}"`;
const matcher = new RegExp(`^${requestedField.environmentName}=.*$`, 'm');
const updated = matcher.test(original)
  ? original.replace(matcher, assignment)
  : `${original.trimEnd()}\n${assignment}\n`;

writeFileSync(secretFile, updated, { encoding: 'utf8', mode: 0o600 });
chmodSync(secretFile, 0o600);
console.log(`${requestedField.environmentName} configured from the clipboard; value not printed.`);
