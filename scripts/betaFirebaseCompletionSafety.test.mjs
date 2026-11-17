import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';
import{assertBetaBuildOptimizationDisabled as optimization,assertBetaFirebaseDeployCompleted as completed}from'./betaFirebaseCompletionSafety.mjs';
const output='hosting[misechef-beta-fa4bf]: release complete\nDeploy complete!';
test('successful full-resource completion is accepted, including colored output',()=>{
 assert.doesNotThrow(()=>completed({status:0,stdout:output}));
 assert.doesNotThrow(()=>completed({status:0,stdout:output.replace('Deploy complete!','\x1b[32mDeploy complete!\x1b[0m')}));
});
test('premature zero exit, wrong project, error, signal and failed exit are rejected',()=>{
 for(const result of [{status:0,stdout:'Functions successful; quota retry pending'},{status:0,stdout:'Deploy complete!'},{status:0,stdout:output.replace('misechef-beta-fa4bf','misechef-fa4bf')},{status:1,stdout:output},{status:0,error:new Error('buffer limit'),stdout:output},{status:0,signal:'SIGTERM',stdout:output}])assert.throws(()=>completed(result));
});
test('source-token optimization cannot be forced on through runner environment',()=>{
 assert.doesNotThrow(()=>optimization(false,{}));assert.throws(()=>optimization(true,{}));
 assert.throws(()=>optimization(false,{FIREBASE_CLI_EXPERIMENTS:'other, functionsv2deployoptimizations'}));
});
test('canonical release disables optimization and proves completion before strict web verification',()=>{
 const code=readFileSync(new URL('./deployBeta.mjs',import.meta.url),'utf8');
 const disable=code.indexOf("run('firebase', ['experiments:disable'");const deploy=code.indexOf("const result = spawnSync('firebase'");const complete=code.indexOf('assertBetaFirebaseDeployCompleted(result)');const web=code.indexOf('await verifyBetaWebRelease(');
 assert.ok(disable>0&&disable<deploy&&deploy<complete&&complete<web);
 assert.match(code,/assertLiveReleaseUnchanged/);assert.match(code,/assertArtifactCompatibility/);assert.match(code,/FULL_BETA_RESOURCE_PLAN.join/);
});
