import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proof,assertMode,assertServices,assertState,assertWrite,assertCandidateHostingConfig,recover } from './recoverBeta38903417240.mjs';
const env={ GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'celim0609/MiseChef/.github/workflows/recover-beta-38903417240.yml@refs/heads/main',GITHUB_RUN_ATTEMPT:'1',MISECHEF_BETA_CI_LOCK_ID:'misechef-beta-deployment',RECOVERY_CONFIRMATION:'RECOVER BETA INCIDENT 38903417240 HOSTING ONLY',EXPECTED_CANDIDATE_SHA:proof.candidate,EXPECTED_CONTROLLER_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40) };
const state=()=>({ services:proof.functions.map(f=>({name:f.name.replace('/functions/','/services/').replace(/[^/]+$/,name=>name.toLowerCase()),latestCreatedRevision:f.revision,latestReadyRevision:f.revision,terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{revision:f.revision,percent:100}]})),release:{version:{name:proof.beforeVersion,config:structuredClone(proof.hostingConfig)}},target:{name:proof.targetVersion,status:'CREATED',createTime:'2026-10-16T12:57:34.630996Z',createUser:{email:'github-beta-deployer@misechef-beta-fa4bf.iam.gserviceaccount.com'}},files:structuredClone(proof.files),functions:proof.functions.map(f=>({name:f.name,state:f.state,serviceConfig:{revision:f.revision,allTrafficOnLatestRevision:f.allTrafficOnLatestRevision},buildConfig:{sourceProvenance:{resolvedStorageSource:f.source}}})),objects:proof.functions.map(f=>({name:f.source.object,generation:f.source.generation,md5Hash:proof.sourceArchiveMd5,size:'317077'})) });

test('only exact protected main workflow, incident, candidate, controller, lock and first attempt are accepted',()=>{
 assert.doesNotThrow(()=>assertMode(env));
 for(const [key,value] of Object.entries(env)) assert.throws(()=>assertMode({...env,[key]:value==='true'?'false':'wrong'}),/refused/);
});
test('pins all 58 Functions revisions/source generations and all 21 original uploaded Hosting files',()=>{
 assert.equal(proof.functions.length,58);assert.equal(proof.files.length,21);assert.doesNotThrow(()=>assertState(state()));
 const changes=[s=>s.functions.pop(),s=>s.functions[0].serviceConfig.revision='new',s=>s.functions[0].serviceConfig.allTrafficOnLatestRevision=false,s=>s.functions[0].state='FAILED',s=>s.functions[0].buildConfig.sourceProvenance.resolvedStorageSource={...s.functions[0].buildConfig.sourceProvenance.resolvedStorageSource,generation:'other'},s=>s.files[0].hash='other',s=>s.files.pop(),s=>s.files.push({path:'/extra',hash:'other',status:'ACTIVE'}),s=>s.release.version.name=proof.targetVersion,s=>s.release.version.config={},s=>s.target.createUser.email='other',s=>s.target.createTime='other',s=>s.target.status='FINALIZED'];
 for(const change of changes){const s=state();change(s);assert.throws(()=>assertState(s),/refused/);}
});
test('only the exact version finalization and live Hosting publication can write; no Functions/IAM/rules/Production writes',()=>{
 for(const request of [{method:'POST',url:'https://cloudfunctions.googleapis.com/v2/projects/misechef-beta-fa4bf/functions'},{method:'PATCH',url:'https://firebasehosting.googleapis.com/v1beta1/sites/misechef-fa4bf/versions/14fe4e47319d8004'},{method:'POST',url:'https://run.googleapis.com/setIamPolicy'},{method:'DELETE',url:'anything'}]) assert.throws(()=>assertWrite(request),/refused/);
});
test('successful recovery performs two Hosting-only writes and seals the original artifact before release',async()=>{
 let s=state();const writes=[];
 await recover({readState:async()=>structuredClone(s),request:async request=>{writes.push(request);if(request.method==='PATCH'){s.target.status='FINALIZED';s.target.config=request.data.config;}}});
 assert.equal(writes.length,2);assert.equal(writes[0].method,'PATCH');assert.equal(writes[1].method,'POST');
 for(const write of writes)assert.doesNotThrow(()=>assertWrite(write));
 assert.ok(writes.every(write=>!write.url.includes('cloudfunctions')&&!write.url.includes('misechef-fa4bf/')));
});
test('before-state drift causes zero writes; drift after sealing prevents publication',async()=>{
 const invalid=state();invalid.files[0].hash='changed';let count=0;
 await assert.rejects(recover({readState:async()=>invalid,request:async()=>{count++;}}),/refused/);assert.equal(count,0);
 const s=state();await assert.rejects(recover({readState:async()=>structuredClone(s),request:async request=>{count++;s.target.status='FINALIZED';s.target.config=request.data.config;s.functions[0].serviceConfig.revision='changed';}}),/refused/);assert.equal(count,1);
});
test('workflow retains Beta approval, concurrency, immutable trusted gates, exact candidate and read-only recovery evidence',()=>{
 const source=readFileSync(new URL('../.github/workflows/recover-beta-38903417240.yml',import.meta.url),'utf8');
 for(const text of ['environment: beta','group: misechef-beta-deployment','9c2173b9f9ae42b1fc09826c57cef46697759452',proof.candidate,'validateBetaReleaseBaseline.mjs','runBetaProtectedTests.mjs','expected_controller_sha'])assert.ok(source.includes(text));
 assert.doesNotMatch(source,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_PRODUCTION|firebase deploy|set-iam-policy|add-iam-policy-binding/);
});

test('pinned Hosting routing matches the reviewed candidate configuration and rejects unrelated route changes',()=>{
 const config=JSON.parse(readFileSync(new URL('../firebase.json',import.meta.url))).hosting;
 assert.doesNotThrow(()=>assertCandidateHostingConfig(config));
 config.rewrites[0].function.functionId='other';assert.throws(()=>assertCandidateHostingConfig(config),/refused/);
});

test('checks actual Cloud Run ready revisions and 100% traffic, not just cached Functions configuration',()=>{
 assert.doesNotThrow(()=>assertServices(state().services));
 for(const change of [s=>s.pop(),s=>s[0].latestReadyRevision='other',s=>s[0].latestCreatedRevision='other',s=>s[0].trafficStatuses[0].revision='other',s=>s[0].trafficStatuses[0].percent=50,s=>s[0].terminalCondition.state='CONDITION_FAILED']){const services=state().services;change(services);assert.throws(()=>assertServices(services),/refused/);}
});
