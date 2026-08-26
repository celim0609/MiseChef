import { assertTrustedGate } from './betaCapabilities.mjs';
import { readGateRoots } from './betaGateCli.mjs';

const { trustedRoot } = readGateRoots(process.argv.slice(2), { candidateRequired: false });
const report = assertTrustedGate({ trustedRoot });

console.log(`Trusted Beta gate passed: ${report.contractId}`);
console.log(`Protected baseline: ${report.baselineCommit}`);
console.log(`Capability authority: ${report.authorityCommit}`);
