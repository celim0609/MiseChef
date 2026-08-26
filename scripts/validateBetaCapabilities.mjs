import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBetaCapabilities } from './betaCapabilities.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = assertBetaCapabilities({ repositoryRoot });

console.log(
  `Beta capability contract passed: ${report.counts.capabilities} capabilities, `
  + `${report.counts.protectedFunctions}/${report.counts.discoveredFunctions} protected/discovered Functions, `
  + `${report.counts.routes} routes, ${report.counts.storageCapabilities} Storage paths, `
  + `${report.counts.indexes} indexes, ${report.counts.hostingRewrites} Hosting rewrites.`
);
if (report.additions.functions.length > 0) console.log(`Allowed additive Functions: ${report.additions.functions.join(', ')}`);
