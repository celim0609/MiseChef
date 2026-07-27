import { spawn } from 'node:child_process';
import {
  chmodSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const secretFile = fileURLToPath(
  new URL('../functions/.secret.local', import.meta.url)
);
const original = readFileSync(secretFile, 'utf8');
const secretKey = original.match(/^STRIPE_SECRET_KEY="(sk_test_[A-Za-z0-9]+)"$/m)?.[1];
if (!secretKey) {
  console.error('Configure STRIPE_SECRET_KEY before starting the webhook listener.');
  process.exit(1);
}

const endpoint = [
  'http://127.0.0.1:5001',
  'demo-misechef-preview',
  'us-central1',
  'stripeStorePaymentWebhook'
].join('/');
const events = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.processing',
  'payment_intent.canceled',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed'
].join(',');

const listener = spawn('stripe', [
  'listen',
  '--api-key',
  secretKey,
  '--events',
  events,
  '--forward-to',
  endpoint
], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
let configured = false;

const inspectOutput = chunk => {
  output = `${output}${chunk.toString('utf8')}`.slice(-20_000);
  const signingSecret = output.match(/\bwhsec_[A-Za-z0-9]+\b/)?.[0];
  if (!signingSecret || configured) return;

  const current = readFileSync(secretFile, 'utf8');
  const assignment = `STRIPE_WEBHOOK_SECRET="${signingSecret}"`;
  const updated = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(current)
    ? current.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, assignment)
    : `${current.trimEnd()}\n${assignment}\n`;
  writeFileSync(secretFile, updated, { encoding: 'utf8', mode: 0o600 });
  chmodSync(secretFile, 0o600);
  configured = true;
  console.log('Stripe sandbox webhook listener ready; signing secret saved locally without printing it.');
};

listener.stdout.on('data', inspectOutput);
listener.stderr.on('data', inspectOutput);
listener.on('error', error => {
  console.error(`Stripe webhook listener could not start: ${error.message}`);
  process.exitCode = 1;
});
listener.on('exit', code => {
  if (!configured && code) {
    console.error('Stripe webhook listener exited before it returned a signing secret.');
  }
  process.exitCode = code || 0;
});

const stop = signal => {
  if (!listener.killed) listener.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
