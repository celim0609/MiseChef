import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BETA_MIXED_RELEASE_20261025_INCIDENT as incident, assert20261025Candidate, assert20261025LiveState, assert20261025Available, assertDurableLiveUnchanged, assertRecovery20261025Mode, create20261025TemporaryRc, assert20261025TemporaryConfig } from './betaMixedRelease20261025Recovery.mjs';
test('recovery accepts only exact requested application SHA/tree and baseline ancestry',()=>{
 const good={head:incident.candidateCommit,sourceTree:incident.candidateSourceTree,isAncestor:()=>true};
 assert.doesNotThrow(()=>assert20261025Candidate(good));
 for(const bad of [{head:'8529400ea650d534d2bd341ade2589043bae2bd1'},{sourceTree:'bad'},{isAncestor:()=>false}])assert.throws(()=>assert20261025Candidate({...good,...bad}));
});
test('recovery pins every incident field and refuses any changed durable live identity',()=>{
 assert.doesNotThrow(()=>assert20261025LiveState(incident.live));
 for(const key of Object.keys(incident.live))assert.throws(()=>assert20261025LiveState({...incident.live,[key]:'changed'}));
 assert.throws(()=>assertDurableLiveUnchanged(incident.live,{...incident.live,hostingVersion:'changed'}));
 assert.throws(()=>assert20261025Available({incident:'old'}));
 assert.doesNotThrow(()=>assert20261025Available(null));
});
test('protected confirmation, secret, lock, and CI context cannot be omitted',()=>{
 assert.throws(()=>assertRecovery20261025Mode({confirmation:incident.confirmation,authorization:'',githubActions:true,ciLockId:'misechef-beta-deployment'}));
});
test('temporary configuration resolves only the concrete Beta project and bucket',()=>{
 const rc=create20261025TemporaryRc({projects:{beta:'misechef-beta-fa4bf',production:'misechef-fa4bf'},targets:{'misechef-beta-fa4bf':{storage:{'beta-default':['misechef-beta-fa4bf.firebasestorage.app']}}}});
 const firebaseConfig={storage:[{target:'beta-default',rules:'storage.rules'}]};
 assert.doesNotThrow(()=>assert20261025TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-beta-fa4bf'}));
 assert.throws(()=>assert20261025TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-fa4bf'}));
});
test('controller preserves permission preflight, one-shot marker and full-resource deployment',()=>{
 const controller=readFileSync(new URL('./recoverBetaMixedRelease20261025.mjs',import.meta.url),'utf8');
 assert.ok(controller.indexOf('await run20260926PermissionPreflight')<controller.lastIndexOf('probe();'));
 assert.match(controller,/FULL_BETA_RESOURCE_PLAN.join/);
 assert.match(controller,/assertDurableLiveUnchanged/);
 assert.match(controller,/assertArtifactCompatibility/);
 const workflow=readFileSync(new URL('../.github/workflows/recover-beta-run-40156447172.yml',import.meta.url),'utf8');
 assert.match(workflow,/environment: beta/);
 assert.match(workflow,/group: misechef-beta-deployment/);
 assert.match(workflow,/runBetaProtectedTests/);
 assert.match(workflow,/test:store-sets:rules/);
 assert.match(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
 assert.doesNotMatch(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_PRODUCTION/);
});
