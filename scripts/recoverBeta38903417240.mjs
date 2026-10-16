// One-time, Hosting-only completion of the already-uploaded artifact from run 38903417240.
// Normal release gates remain unchanged; this controller accepts only the pinned incident state.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { assertAuthority, assertCleanSource, assertLiveBaseline } from './betaDeploymentSafety.mjs';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';

export const proof = JSON.parse(readFileSync(new URL('./betaRecovery38903417240.json', import.meta.url)));
const project = 'misechef-beta-fa4bf';
const hosting = 'https://firebasehosting.googleapis.com/v1beta1/';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,ordered(value[key])])) : value;
const same = (a,b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const fail = message => { throw new Error(`Incident 38903417240 recovery refused: ${message}`); };
const canonicalFiles = files => files.map(({ path, hash, status }) => ({ path, hash, status })).sort((a, b) => a.path.localeCompare(b.path, 'en'));
const canonicalFunctions = functions => functions.map(f => ({ name:f.name, state:f.state, revision:f.serviceConfig?.revision, allTrafficOnLatestRevision:f.serviceConfig?.allTrafficOnLatestRevision, source:f.buildConfig?.sourceProvenance?.resolvedStorageSource })).sort((a,b) => a.name.localeCompare(b.name, 'en'));

export function assertMode(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== 'celim0609/MiseChef/.github/workflows/recover-beta-38903417240.yml@refs/heads/main' || env.GITHUB_RUN_ATTEMPT !== '1' || env.MISECHEF_BETA_CI_LOCK_ID !== 'misechef-beta-deployment'
    || env.RECOVERY_CONFIRMATION !== 'RECOVER BETA INCIDENT 38903417240 HOSTING ONLY'
    || env.EXPECTED_CANDIDATE_SHA !== proof.candidate || env.EXPECTED_CONTROLLER_SHA !== env.GITHUB_SHA
    || !/^[0-9a-f]{40}$/.test(env.EXPECTED_CONTROLLER_SHA || '')) fail('protected main workflow, exact authorization, candidate and controller SHA are required.');
}
export function assertServices(services) {
  if (!Array.isArray(services) || services.length!==proof.functions.length) fail('Cloud Run service inventory differs.');
  const byName=new Map(services.map(service=>[service.name,service]));
  for (const fn of proof.functions) {
    const service=byName.get(fn.name.replace('/functions/','/services/').replace(/[^/]+$/,name=>name.toLowerCase()));
    const short=value=>String(value || '').split('/').at(-1);
    const traffic=service?.trafficStatuses || [];
    if (!service || short(service.latestCreatedRevision)!==fn.revision || short(service.latestReadyRevision)!==fn.revision || service.terminalCondition?.state!=='CONDITION_SUCCEEDED'
      || !traffic.length || traffic.reduce((sum,item)=>sum+Number(item.percent || 0),0)!==100 || !traffic.every(item=>short(item.revision)===fn.revision)) fail(`Cloud Run ready revision or actual traffic differs for ${fn.name}.`);
  }
}
export function assertState(state, finalized = false) {
  assertServices(state.services);
  if (state.release?.version?.name !== proof.beforeVersion) fail('live Hosting changed or incident already completed.');
  if (state.target?.name !== proof.targetVersion || state.target.status !== (finalized ? 'FINALIZED' : 'CREATED')) fail('uploaded incident version is unavailable or already consumed.');
  if (state.target.createTime !== '2026-10-16T12:57:34.630996Z' || state.target.createUser?.email !== `github-beta-deployer@${project}.iam.gserviceaccount.com`) fail('uploaded version provenance differs.');
  if (!same(state.release.version.config, proof.hostingConfig)) fail('live Hosting configuration drifted.');
  if (finalized && !same(state.target.config, proof.hostingConfig)) fail('finalized routing configuration differs.');
  if (!same(canonicalFiles(state.files), canonicalFiles(proof.files))) fail('uploaded artifact files/hashes differ.');
  if (!same(canonicalFunctions(state.functions), canonicalFunctions(proof.functions.map(f => ({ ...f, serviceConfig:f, buildConfig:{ sourceProvenance:{ resolvedStorageSource:f.source } } }))))) fail('Functions revisions, traffic, source generations or readiness differ.');

}

// The only permitted writes finalize and publish this existing Beta Hosting version.
export function assertCandidateHostingConfig(config) {
  const normalized = {
    headers:config.headers.map(({source,regex,headers})=>({headers:Object.fromEntries(headers.map(({key,value})=>[key,value])),...(source ? {glob:source} : {regex})})),
    rewrites:config.rewrites.map(({source,regex,destination,function:fn})=>({...(source ? {glob:source} : {regex}),...(fn ? {run:{serviceId:fn.functionId.toLowerCase(),region:fn.region}} : {path:destination})}))
  };
  if (!same(normalized,proof.hostingConfig)) fail('pinned Hosting routing does not match the exact candidate configuration.');
}
export function assertWrite(request) {
  const finalize = request.method === 'PATCH' && request.url === `${hosting}${proof.targetVersion}` && same(request.params,{ updateMask:'status,config' }) && same(request.data,{ status:'FINALIZED',config:proof.hostingConfig });
  const publish = request.method === 'POST' && request.url === `${hosting}sites/${project}/releases` && same(request.params,{ versionName:proof.targetVersion }) && same(request.data,{ message:'One-time protected Hosting-only recovery of failed Actions run 38903417240; candidate '+proof.candidate });
  if (!finalize && !publish) fail('write is outside the exact Hosting-only incident plan.');
}
export async function recover({ readState, request }) {
  assertState(await readState());
  const finalize = { method:'PATCH',url:`${hosting}${proof.targetVersion}`,params:{ updateMask:'status,config' },data:{ status:'FINALIZED',config:proof.hostingConfig } };
  assertWrite(finalize); await request(finalize);
  // Finalization seals the artifact. Recheck every file and Function before publication.
  assertState(await readState(),true);
  const publish = { method:'POST',url:`${hosting}sites/${project}/releases`,params:{ versionName:proof.targetVersion },data:{ message:'One-time protected Hosting-only recovery of failed Actions run 38903417240; candidate '+proof.candidate } };
  assertWrite(publish); await request(publish);
}

async function main() {
  assertMode(process.env);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const flag = process.argv.indexOf('--candidate-root');
  if (flag < 0) fail('immutable candidate checkout is required.');
  const candidate = path.resolve(process.argv[flag+1]);
  const git = (args,cwd = candidate) => execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
  if (git(['rev-parse','HEAD'],root) !== process.env.EXPECTED_CONTROLLER_SHA || git(['rev-parse','HEAD']) !== proof.candidate || git(['rev-parse','HEAD^{tree}']) !== proof.sourceTree) fail('controller/candidate checkout is not exact.');
  for (const cwd of [root,candidate]) assertCleanSource(git(['status','--porcelain=v1','--untracked-files=all'],cwd).split('\n').filter(Boolean));
  assertAuthority({ authorityBaseline:process.env.MISECHEF_BETA_PROTECTED_BASELINE,documentedBaseline:JSON.parse(readFileSync(path.join(candidate,'config/beta-release-baseline.json'))).minimumCommit,head:proof.candidate,isAncestor:(a,b)=>{ try { git(['merge-base','--is-ancestor',a,b]);return true; } catch { return false; } } });
  assertCandidateHostingConfig(JSON.parse(readFileSync(path.join(candidate,'firebase.json'))).hosting);
  if (process.env.MISECHEF_BETA_PROTECTED_BASELINE !== proof.baseline) fail('external release authority changed.');
  const { GoogleAuth } = createRequire(path.join(candidate,'functions/package.json'))('google-auth-library');
  const auth = new GoogleAuth({ projectId:project,scopes:['https://www.googleapis.com/auth/cloud-platform'] });
  const request = async options => {
    if (options.method !== 'GET') assertWrite(options);
    return auth.request(options);
  };
  const get = async (url,params) => (await request({ method:'GET',url,...(params ? {params} : {}) })).data;
  const readState = async () => {
    const [releases,target,files,functions,services] = await Promise.all([
      get(`${hosting}sites/${project}/releases`,{pageSize:1}),get(hosting+proof.targetVersion),get(`${hosting}${proof.targetVersion}/files`,{pageSize:1000}),
      get(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1/functions`,{pageSize:1000}),
      get(`https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services`,{pageSize:1000})
    ]);
    if (files.nextPageToken || functions.nextPageToken || services.nextPageToken) fail('proof requires a complete unpaginated inventory.');
    return { release:releases.releases?.[0],target,files:files.files || [],functions:functions.functions || [],services:services.services || [] };
  };
  const before = await readState(); assertState(before);
  // These immutable source generations were byte-verified against all 102 tracked
  // Functions files and the generated Hosting shell during incident investigation.
  // Recheck their exact references/revisions; do not add Storage permissions.
  const evidence = path.join(process.env.RUNNER_TEMP || os.tmpdir(),'beta-incident-38903417240');mkdirSync(evidence,{recursive:true});
  writeFileSync(path.join(evidence,'recovery-before.json'),JSON.stringify({ incidentRun:proof.incidentRun,targetVersion:proof.targetVersion,liveVersion:before.release.version.name,functions:canonicalFunctions(before.functions) },null,2));
  if (process.argv.includes('--dry-run')) { console.log('Exact incident proof passed; no writes performed.');return; }
  await recover({readState,request});
  const after = await readState(); assertServices(after.services);
  if (after.release?.version?.name !== proof.targetVersion || !same(canonicalFunctions(after.functions),canonicalFunctions(before.functions))) fail('post-recovery Hosting version or unchanged Functions proof failed.');
  if (!same(canonicalFiles(after.files),canonicalFiles(proof.files))) fail('published file hashes changed.');
  let live;
  for (let attempt=0;attempt<12;attempt++) {
    live=await readLiveBetaFingerprint();
    if (live.releaseCommit===proof.candidate && live.rootAsset===proof.entryAsset && live.storeAsset===proof.entryAsset) break;
    if (attempt<11) await new Promise(resolve=>setTimeout(resolve,5000));
  }
  assertLiveBaseline({liveFingerprint:live,resolveSourceTree:commit=>git(['rev-parse',`${commit}^{tree}`]),isAncestor:(a,b)=>{try{git(['merge-base','--is-ancestor',a,b]);return true;}catch{return false;}}});
  const manifest=await (await fetch(`https://${project}.web.app/.well-known/misechef-beta-release.json?incident-verify=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}})).json();
  if (manifest.sourceCommit!==proof.candidate || manifest.sourceTree!==proof.sourceTree || manifest.entryAsset!==proof.entryAsset || manifest.storeShellAsset!==proof.entryAsset) fail('published original manifest does not identify the intended release.');
  const asset=await fetch(`https://${project}.web.app${proof.entryAsset}?incident-verify=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}});
  if (!asset.ok || !/javascript/i.test(asset.headers.get('content-type') || '') || sha256(Buffer.from(await asset.arrayBuffer()))!==manifest.entryAssetSha256) fail('published JavaScript bytes do not match the original manifest.');
  for (const [url,expectedStatus] of [[`https://${project}.web.app/store/misechef-s-grab-go-store`,200],['https://renderpublicstore-dapyzgon7a-uc.a.run.app/store/misechef-s-grab-go-store',200],['https://renderpublicrecipe-dapyzgon7a-uc.a.run.app/recipes/recovery-endpoint-check',404]]) {
    const response=await fetch(url);if (response.status!==expectedStatus) fail(`public render verification returned HTTP ${response.status}.`);
  }
  writeFileSync(path.join(evidence,'recovery-after.json'),JSON.stringify({ release:after.release.name,version:after.release.version.name,manifest,live,functionsUnchanged:true,functions:canonicalFunctions(after.functions) },null,2));
  console.log(`Hosting-only incident recovery complete: ${proof.targetVersion}; candidate ${proof.candidate}; all 58 Functions revisions unchanged.`);
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
