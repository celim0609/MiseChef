import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BETA_MIXED_RELEASE_20261030_INCIDENT as incident, assert20261030Candidate, assert20261030LiveState, assert20261030Available, assertDurableLiveUnchanged, assertRecovery20261030Mode, create20261030TemporaryRc, assert20261030TemporaryConfig } from './betaMixedRelease20261030Recovery.mjs';
test('recovery accepts only exact requested application SHA/tree and baseline ancestry',()=>{
 const good={head:incident.candidateCommit,sourceTree:incident.candidateSourceTree,isAncestor:()=>true};
 assert.doesNotThrow(()=>assert20261030Candidate(good));
 for(const bad of [{head:'8529400ea650d534d2bd341ade2589043bae2bd1'},{sourceTree:'bad'},{isAncestor:()=>false}])assert.throws(()=>assert20261030Candidate({...good,...bad}));
});
test('recovery pins every incident field and refuses any changed durable live identity',()=>{
 assert.doesNotThrow(()=>assert20261030LiveState(incident.live));
 for(const key of Object.keys(incident.live))assert.throws(()=>assert20261030LiveState({...incident.live,[key]:'changed'}));
 assert.throws(()=>assertDurableLiveUnchanged(incident.live,{...incident.live,hostingVersion:'changed'}));
 assert.throws(()=>assert20261030Available({incident:'old'}));
 assert.doesNotThrow(()=>assert20261030Available(null));
});
test('protected confirmation, secret, lock, and CI context cannot be omitted',()=>{
 assert.throws(()=>assertRecovery20261030Mode({confirmation:incident.confirmation,authorization:'',githubActions:true,ciLockId:'misechef-beta-deployment'}));
});
test('temporary configuration resolves only the concrete Beta project and bucket',()=>{
 const rc=create20261030TemporaryRc({projects:{beta:'misechef-beta-fa4bf',production:'misechef-fa4bf'},targets:{'misechef-beta-fa4bf':{storage:{'beta-default':['misechef-beta-fa4bf.firebasestorage.app']}}}});
 const firebaseConfig={storage:[{target:'beta-default',rules:'storage.rules'}]};
 assert.doesNotThrow(()=>assert20261030TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-beta-fa4bf'}));
 assert.throws(()=>assert20261030TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-fa4bf'}));
});
test('controller preserves permission preflight, one-shot marker and full-resource deployment',()=>{
 const controller=readFileSync(new URL('./recoverBetaMixedRelease20261030.mjs',import.meta.url),'utf8');
 assert.ok(controller.indexOf('await run20260926PermissionPreflight')<controller.lastIndexOf('probe();'));
 assert.match(controller,/FULL_BETA_RESOURCE_PLAN.join/);
 assert.match(controller,/assertDurableLiveUnchanged/);
 assert.match(controller,/assertArtifactCompatibility/);
 const workflow=readFileSync(new URL('../.github/workflows/recover-beta-mixed-release-20261030.yml',import.meta.url),'utf8');
 assert.match(workflow,/environment: beta/);
 assert.match(workflow,/group: misechef-beta-deployment/);
 assert.match(workflow,/runBetaProtectedTests/);
 assert.match(workflow,/test:store-sets:rules/);
 assert.match(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
 assert.doesNotMatch(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_PRODUCTION/);
});

test('exact external SHA approval and required CI context must all match',()=>{
 const args={confirmation:incident.confirmation,approvedSha:incident.candidateCommit,githubActions:true,ciLockId:'misechef-beta-deployment'};
 assert.doesNotThrow(()=>assertRecovery20261030Mode(args));
 for(const change of [{confirmation:''},{approvedSha:''},{approvedSha:'d72e873c04037256f5b3996e181477a7b753c69e'},{githubActions:false},{githubActions:'true'},{ciLockId:'production'}])assert.throws(()=>assertRecovery20261030Mode({...args,...change}));
});
test('a zero CLI exit without finalized Hosting and full completion is rejected',async()=>{
 const {assert20261030DeployCompleted:completed}=await import('./betaMixedRelease20261030Recovery.mjs');
 const output='hosting[misechef-beta-fa4bf]: release complete\nDeploy complete!';
 assert.doesNotThrow(()=>completed({code:0,output}));
 for(const state of [{code:1,output},{code:0,output:'functions update successful'},{code:0,output:'Deploy complete!'},{code:0,output:'hosting[production]: release complete\nDeploy complete!'}])assert.throws(()=>completed(state));
});
test('controller disables token reuse without editing CLI code and requires original candidate verification',()=>{
 const code=readFileSync(new URL('./recoverBetaMixedRelease20261030.mjs',import.meta.url),'utf8');
 assert.match(code,/experiments:disable.*functionsv2deployoptimizations/);
 assert.match(code,/Unsafe source-token optimization forced by environment/);
 assert.ok(code.indexOf('writeObject(markerFile, markerPath)')<code.indexOf("spawn('firebase'"));
 assert.match(code,/assert20261030DeployCompleted/);assert.match(code,/await verifyBetaWebRelease/);
 assert.match(code,/Expected Function is not ACTIVE/);
 assert.doesNotMatch(code,/--force|accept.*stale|process\.exit\(0\)/);
});

test('pinned CLI token retry reproduces premature zero exit; disabling reuse allows retry', async()=>{
 const {execFileSync,spawnSync}=await import('node:child_process');
 const path=await import('node:path');
 const root=process.env.FIREBASE_TOOLS_ROOT || path.join(execFileSync('npm',['root','--global'],{encoding:'utf8'}).trim(),'firebase-tools');
 assert.equal(JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version,'14.22.0');
 const source=readFileSync(path.join(root,'lib/deploy/functions/release/sourceTokenScraper.js'),'utf8');
 const prefix=`const vm=require('node:vm'); const context={exports:{},require:()=>({logger:{debug(){}},assertExhaustive(){throw Error('unexpected')}}),Date}; vm.runInNewContext(${JSON.stringify(source)},context);`;
 const broken=spawnSync(process.execPath,['-e',prefix+`(async()=>{const scraper=new context.exports.SourceTokenScraper();await scraper.getToken();console.log('quota rejected before operation');await scraper.getToken();console.log('completed');})();`],{encoding:'utf8',timeout:3000});
 assert.equal(broken.status,0);assert.match(broken.stdout,/quota rejected/);assert.doesNotMatch(broken.stdout,/completed/);
 const safe=spawnSync(process.execPath,['-e',prefix+`(async()=>{const scraper=new context.exports.SourceTokenScraper();let calls=0;async function update(){if(++calls===1)throw Error('429');return 'operation';}try{await update();}catch{console.log(await update());}console.log('completed');})();`],{encoding:'utf8',timeout:3000});
 assert.equal(safe.status,0);assert.match(safe.stdout,/operation\ncompleted/);
});

test('resource inventory hashes detect Function and Rules drift without depending on list order',async()=>{
 const {incidentResourceHashes}=await import('./betaMixedRelease20261030Recovery.mjs');
 const functions=[{id:'b',state:'ACTIVE',updateTime:'now',revision:'b-1'},{id:'a',state:'ACTIVE',updateTime:'now',revision:'a-1'}];
 const rules=[{name:'firestore',rulesetName:'rules/1',updateTime:'now'}];
 const expected=incidentResourceHashes({functions,rules});
 assert.deepEqual(incidentResourceHashes({functions:[...functions].reverse(),rules}),expected);
 assert.notEqual(incidentResourceHashes({functions:[{...functions[0],revision:'b-2'},functions[1]],rules}).functionsStateSha256,expected.functionsStateSha256);
 assert.notEqual(incidentResourceHashes({functions,rules:[{...rules[0],rulesetName:'rules/2'}]}).rulesStateSha256,expected.rulesStateSha256);
});

test('renderer traffic checks reject pins, splits and unfinished revisions',async()=>{
 const {assert20261030RendererTraffic:check}=await import('./betaMixedRelease20261030Recovery.mjs');
 const latest='TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST';
 const service={traffic:[{type:latest,percent:100}],trafficStatuses:[{type:latest,percent:100,revision:'ready'}],latestReadyRevision:'services/render/revisions/ready',latestCreatedRevision:'services/render/revisions/ready'};
 assert.doesNotThrow(()=>check(service));
 for(const change of [{traffic:[{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',percent:100}]},{traffic:[{type:latest,percent:50}]},{trafficStatuses:[{type:latest,percent:100,revision:'old'}]},{latestCreatedRevision:'services/render/revisions/new'},{trafficStatuses:[]}])assert.throws(()=>check({...service,...change}));
});

test('Function health proof includes the entry-point renderer but excludes exported helper factories',async()=>{
 const {candidate20261030FunctionIds:ids}=await import('./betaMixedRelease20261030Recovery.mjs');
 const result=ids(readFileSync(new URL('../functions/index.js',import.meta.url),'utf8'),readFileSync(new URL('../functions/entry.js',import.meta.url),'utf8'));
 assert.ok(result.includes('renderPublicRecipe'));assert.ok(result.includes('renderPublicStore'));assert.ok(result.includes('dispatchReadyStoreFulfilments'));
 assert.ok(!result.includes('createCurlecStorePaymentWebhookHandler'));assert.ok(!result.includes('curlecStorePaymentWebhookHandler'));
 assert.deepEqual(ids('export const helper = () => {};\nexport const callable = onCall({});','export const renderer =\n onRequest({});'),['callable','renderer']);
});
