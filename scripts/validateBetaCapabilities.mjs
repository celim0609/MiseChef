import { assertBetaCapabilities } from './betaCapabilities.mjs';
import { readGateRoots } from './betaGateCli.mjs';

const { trustedRoot, candidateRoot } = readGateRoots();
const report = assertBetaCapabilities({ trustedRoot, candidateRoot });

console.log(
  `Beta capability contract passed: ${report.counts.capabilities} capabilities, `
  + `${report.counts.protectedFunctions}/${report.counts.discoveredFunctions} protected/discovered Functions, `
  + `${report.counts.routes} routes, ${report.counts.storageCapabilities} Storage paths, `
  + `${report.counts.indexes} indexes, ${report.counts.hostingRewrites} Hosting rewrites.`
);
if (report.additions.functions.length > 0) console.log(`Allowed additive Functions: ${report.additions.functions.join(', ')}`);
