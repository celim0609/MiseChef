import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WHATSAPP_PREVIEW_PATHS = [
  'src/modules/store/WhatsAppCustomerButton.tsx',
  'src/modules/store/WhatsAppCustomerButton.test.tsx',
  'src/modules/store/whatsappOrderConfirmation.ts',
  'functions/storeDelivery.test.js'
];
export function assertWhatsAppPreviewScope({ expected, approved, baseline, liveProduction, resolved, changedPaths, ancestor, ref, event }) {
  if (ref !== 'refs/heads/main' || event !== 'workflow_dispatch') throw new Error('Preview controller must run manually from protected main.');
  for (const sha of [expected, approved, baseline, liveProduction, resolved]) if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Exact SHA authority is required.');
  if (expected !== approved || resolved !== approved) throw new Error('Candidate does not match environment-approved SHA.');
  if (baseline !== liveProduction || !ancestor) throw new Error('Candidate must descend from the unchanged live Production baseline.');
  if (!changedPaths.length || changedPaths.some(p => !WHATSAPP_PREVIEW_PATHS.includes(p))) throw new Error('Preview permits only WhatsApp files and the approved regression fixture clocks.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(process.argv[process.argv.indexOf('--candidate-root') + 1]);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const readManifest = async url => {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Cannot read release fingerprint: ${response.status}`);
    return response.json();
  };
  const production = await readManifest('https://misechef-fa4bf.web.app/.well-known/misechef-production-release.json');
  const beta = await readManifest('https://misechef-beta-fa4bf.web.app/.well-known/misechef-beta-release.json');
  const baseline = process.env.MISECHEF_WHATSAPP_PRODUCTION_BASELINE;
  let ancestor = false;
  try { git(['merge-base', '--is-ancestor', baseline, 'HEAD']); ancestor = true; } catch {}
  const changedPaths = git(['diff', '--name-only', baseline, 'HEAD']).split('\n').filter(Boolean);
  assertWhatsAppPreviewScope({ expected: process.env.EXPECTED_SHA, approved: process.env.MISECHEF_WHATSAPP_PREVIEW_APPROVED_SHA, baseline, liveProduction: production.sourceCommit, resolved: git(['rev-parse', 'HEAD']), changedPaths, ancestor, ref: process.env.GITHUB_REF, event: process.env.GITHUB_EVENT_NAME });
  const fixtureDiff = git(['diff', '--unified=0', baseline, 'HEAD', '--', 'functions/storeDelivery.test.js']);
  // Require the exact already-reviewed clock-only fix, even inside the test allowlist.
  const approvedFixture = execFileSync('git', ['show', '87f7df26b92471c9c4221e78ba879c72de3b99db:functions/storeDelivery.test.js'], { cwd: root });
  const candidateFixture = execFileSync('git', ['show', 'HEAD:functions/storeDelivery.test.js'], { cwd: root });
  if (fixtureDiff && !candidateFixture.equals(approvedFixture)) throw new Error('Delivery test changes exceed the approved clock-only fixture fix.');
  writeFileSync(path.join(process.env.RUNNER_TEMP, 'whatsapp-preview-authority.json'), JSON.stringify({ sourceCommit: git(['rev-parse', 'HEAD']), sourceTree: git(['rev-parse', 'HEAD^{tree}']), productionBaseline: baseline, betaLiveCommit: beta.sourceCommit, betaLiveAsset: beta.entryAsset, changedPaths }, null, 2));
  console.log('PASS: exact WhatsApp-only candidate and unchanged Production authority verified.');
}
