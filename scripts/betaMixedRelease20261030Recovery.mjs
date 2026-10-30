import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BETA_PROJECT_ID, BETA_STORAGE_BUCKET, BETA_STORAGE_TARGET, MANDATORY_BETA_BASELINE, assertExplicitBetaStorageTarget } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_20261030_INCIDENT = Object.freeze({
  id: 'beta-mixed-release-2026-10-30',
  confirmation: 'RECOVER BETA MIXED RELEASE 20261030',
  candidateCommit: 'fb8bd32821c3ebb0ad111255c31125f5475a0838',
  candidateSourceTree: '09850ceeb7833999385f8022ab6ecd69b9ac0b5a',
  live: Object.freeze({
    rootAsset: '/assets/index-C-0gzlmi.js', storeAsset: '/assets/index-CSIC1z7I.js',
    rootAssetSha256: 'eee0af63c38cbd56c30dbc0d935749028326795cca13a0419b068e4ec266e43a',
    storeAssetSha256: '9fbe3922861d217651829400538a1d0ccff3d8973a68d59c3a07c6bccd881712',
    releaseCommit: 'd72e873c04037256f5b3996e181477a7b753c69e',
    releaseSourceTree: '6430ca50db74c40187d435389670a1fa0154a6fd',
    releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
    releaseBuildId: '3de304f4-df42-4568-9ed0-8e9b49e99e2e',
    releaseStoreShellAsset: '/assets/index-C-0gzlmi.js',
    hostingVersion: 'sites/misechef-beta-fa4bf/versions/e17b740d015ddd41',
    renderPublicStoreRevision: 'renderpublicstore-00243-moy',
    functionsStateSha256: 'fc24f1c8eec8c211c39da59acd5953ecbfce28c73dcdcdde9aa37b9b17a3717b',
    rulesStateSha256: '8cdbbd7c2bee14777d05accb6891455e341794383ffededa6fa6887f5e466e0e'
  }),
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-10-30.json'
});

export const BETA_DEPLOYER_SERVICE_ACCOUNT = 'github-beta-deployer@misechef-beta-fa4bf.iam.gserviceaccount.com';
export const BETA_APP_ENGINE_SERVICE_ACCOUNT = 'misechef-beta-fa4bf@appspot.gserviceaccount.com';
// Exact firebase-tools@14.22.0 deploy TARGET_PERMISSIONS for functions, hosting,
// firestore and storage, plus the HTTPS-function IAM check run by that CLI.

const fail = message => { throw new Error(`Beta mixed-release 20261030 recovery refused: ${message}`); };


export const assertRecovery20261030Mode = ({ confirmation, approvedSha, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_20261030_INCIDENT.confirmation
    || approvedSha !== BETA_MIXED_RELEASE_20261030_INCIDENT.candidateCommit
    || githubActions !== true || ciLockId !== 'misechef-beta-deployment') fail('authorization, CI context, or lock is invalid.');
};
export const assert20261030Candidate = ({ head, sourceTree, isAncestor }) => {
  const incident = BETA_MIXED_RELEASE_20261030_INCIDENT;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree || !isAncestor(incident.live.releaseCommit, head)) fail('candidate SHA or tree is not the approved descendant.');
};
export const assert20261030Available = marker => { if (marker) fail('incident is already consumed and cannot be retried.'); };
export const assert20261030LiveState = live => {
  for (const [key, value] of Object.entries(BETA_MIXED_RELEASE_20261030_INCIDENT.live)) if (live?.[key] !== value) fail(`durable live ${key} differs from the pinned incident state.`);
};
export const assertDurableLiveUnchanged = (before, current) => {
  const keys = ['rootAsset', 'storeAsset', 'rootAssetSha256', 'storeAssetSha256', 'releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline', 'releaseBuildId', 'releaseStoreShellAsset', 'hostingVersion', 'renderPublicStoreRevision', 'functionsStateSha256', 'rulesStateSha256'];
  if (!before || !current || keys.some(key => before[key] !== current[key])) fail('durable live release identity changed after validation began.');
};
export const create20261030Marker = ({ runId, startedAt = new Date().toISOString() } = {}) => ({
  incident: BETA_MIXED_RELEASE_20261030_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_20261030_INCIDENT.candidateCommit,
  runId: String(runId || ''), deployStartedAt: startedAt
});
export const create20261030TemporaryRc = candidateRc => ({
  projects: { ...candidateRc?.projects },
  targets: { ...candidateRc?.targets, [BETA_PROJECT_ID]: { storage: { [BETA_STORAGE_TARGET]: [...(candidateRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET] || [])] } } },
  etags: {}
});
export const assert20261030TemporaryConfig = ({ firebaseConfig, firebaseRc, resolvedProject }) => {
  if (resolvedProject !== BETA_PROJECT_ID || resolvedProject === 'beta') fail('Firebase project must resolve to the concrete Beta project, never literal beta.');
  assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
  if (firebaseRc?.projects?.beta !== BETA_PROJECT_ID || firebaseRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET]?.[0] !== BETA_STORAGE_BUCKET) fail('temporary Firebase alias or Storage target is not Beta-only.');
};
export const write20261030TemporaryFirebaseFiles = ({ directory, firebaseConfig, candidateRc }) => {
  const firebaseRc = create20261030TemporaryRc(candidateRc);
  const configPath = path.join(directory, 'firebase.json');
  const rcPath = path.join(directory, '.firebaserc');
  writeFileSync(configPath, JSON.stringify(firebaseConfig));
  writeFileSync(rcPath, JSON.stringify(firebaseRc));
  if (!existsSync(configPath) || !existsSync(rcPath)) fail('temporary Firebase configuration files were not written.');
  assert20261030TemporaryConfig({ firebaseConfig: JSON.parse(readFileSync(configPath, 'utf8')), firebaseRc: JSON.parse(readFileSync(rcPath, 'utf8')), resolvedProject: BETA_PROJECT_ID });
  return { configPath, rcPath, firebaseRc };
};
export const assert20261030PermissionPreflight = ({ projectPermissions = [], actAsPermissions = [], requiredProjectPermissions = [] }) => {
  if (!Array.isArray(requiredProjectPermissions) || requiredProjectPermissions.length === 0) fail('pinned Firebase CLI permission contract is missing.');
  const missingProject = requiredProjectPermissions.filter(permission => !projectPermissions.includes(permission));
  if (missingProject.length) fail(`pinned full deploy permission preflight failed: ${missingProject.join(', ')}.`);
  if (!actAsPermissions.includes('iam.serviceAccounts.actAs')) fail(`missing iam.serviceAccounts.actAs on ${BETA_APP_ENGINE_SERVICE_ACCOUNT} for ${BETA_DEPLOYER_SERVICE_ACCOUNT}.`);
};

// firebase-tools@14.22.0 can exit zero with a source-token retry still pending.
// A child exit code alone is not a full-resource completion proof.
export function assert20261030DeployCompleted({code, output}) {
  const text = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  if (code !== 0 || !/Deploy complete!/.test(text)
    || !/hosting\[misechef-beta-fa4bf\]: release complete/.test(text)) {
    fail('Firebase did not confirm full deployment and Hosting release completion.');
  }
}

export const incidentResourceHashes = ({functions, rules}) => ({
  functionsStateSha256: createHash('sha256').update(JSON.stringify(functions.map(fn=>({id:fn.id || fn.name.split('/').pop(),state:fn.state,updateTime:fn.updateTime,revision:fn.revision || fn.serviceConfig?.revision})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex'),
  rulesStateSha256: createHash('sha256').update(JSON.stringify(rules.map(rule=>({name:rule.name,rulesetName:rule.rulesetName,updateTime:rule.updateTime})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex')
});
export async function read20261030IncidentState({readDurable, request}) {
  const renderer=await request({method:'GET',url:`https://run.googleapis.com/v2/projects/${BETA_PROJECT_ID}/locations/us-central1/services/renderpublicstore`});
  assert20261030RendererTraffic(renderer.data);
  const functions=[]; let pageToken='';
  do { const response=await request({method:'GET',url:`https://cloudfunctions.googleapis.com/v2/projects/${BETA_PROJECT_ID}/locations/-/functions`,params:{pageSize:1000,...(pageToken?{pageToken}:{})}}); functions.push(...(response.data.functions || []));pageToken=response.data.nextPageToken || ''; } while(pageToken);
  const rules=await request({method:'GET',url:`https://firebaserules.googleapis.com/v1/projects/${BETA_PROJECT_ID}/releases`});
  return {...await readDurable(),...incidentResourceHashes({functions,rules:rules.data.releases || []})};
}

export function assert20261030RendererTraffic(service) {
  const latest='TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST';
  const traffic=service?.traffic || [], actual=service?.trafficStatuses || [];
  if (traffic.length!==1 || traffic[0].type!==latest || traffic[0].percent!==100
    || actual.length!==1 || actual[0].type!==latest || actual[0].percent!==100
    || !service.latestReadyRevision || service.latestReadyRevision!==service.latestCreatedRevision
    || service.latestReadyRevision.split('/').pop()!==actual[0].revision) {
    fail('renderer traffic must follow the single latest ready revision at 100 percent.');
  }
}

export const candidate20261030FunctionIds = (...sources) => [...new Set(sources.flatMap(source=>[...source.matchAll(/^export const ([A-Za-z0-9_]+)\s*=\s*(?:on|[^\n]*\n\s*\?\s*on)/gm)].map(match=>match[1])))].sort();
