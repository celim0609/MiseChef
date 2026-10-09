import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BETA_MIXED_RELEASE_20261010_INCIDENT as incident, assert20261010Candidate, assert20261010LiveState, assert20261010Available, assertDurableLiveUnchanged, assertRecovery20261010Mode, create20261010TemporaryRc, assert20261010TemporaryConfig } from './betaMixedRelease20261010Recovery.mjs';
test('recovery accepts only exact requested application SHA/tree and baseline ancestry',()=>{
 const good={head:incident.candidateCommit,sourceTree:incident.candidateSourceTree,isAncestor:()=>true};
 assert.doesNotThrow(()=>assert20261010Candidate(good));
 for(const bad of [{head:'8529400ea650d534d2bd341ade2589043bae2bd1'},{sourceTree:'bad'},{isAncestor:()=>false}])assert.throws(()=>assert20261010Candidate({...good,...bad}));
});
test('recovery pins every incident field and refuses any changed durable live identity',()=>{
 assert.doesNotThrow(()=>assert20261010LiveState(incident.live));
 for(const key of Object.keys(incident.live))assert.throws(()=>assert20261010LiveState({...incident.live,[key]:'changed'}));
 assert.throws(()=>assertDurableLiveUnchanged(incident.live,{...incident.live,hostingVersion:'changed'}));
 assert.throws(()=>assert20261010Available({incident:'old'}));
 assert.doesNotThrow(()=>assert20261010Available(null));
});
test('protected confirmation, secret, lock, and CI context cannot be omitted',()=>{
 assert.throws(()=>assertRecovery20261010Mode({confirmation:incident.confirmation,authorization:'',githubActions:true,ciLockId:'misechef-beta-deployment'}));
});
test('temporary configuration resolves only the concrete Beta project and bucket',()=>{
 const rc=create20261010TemporaryRc({projects:{beta:'misechef-beta-fa4bf',production:'misechef-fa4bf'},targets:{'misechef-beta-fa4bf':{storage:{'beta-default':['misechef-beta-fa4bf.firebasestorage.app']}}}});
 const firebaseConfig={storage:[{target:'beta-default',rules:'storage.rules'}]};
 assert.doesNotThrow(()=>assert20261010TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-beta-fa4bf'}));
 assert.throws(()=>assert20261010TemporaryConfig({firebaseConfig,firebaseRc:rc,resolvedProject:'misechef-fa4bf'}));
});
test('controller preserves permission preflight, one-shot marker and full-resource deployment',()=>{
 const controller=readFileSync(new URL('./recoverBetaMixedRelease20261010.mjs',import.meta.url),'utf8');
 assert.ok(controller.indexOf('await run20260926PermissionPreflight')<controller.lastIndexOf('probe();'));
 assert.match(controller,/FULL_BETA_RESOURCE_PLAN.join/);
 assert.match(controller,/assertDurableLiveUnchanged/);
 assert.match(controller,/assertArtifactCompatibility/);
 const workflow=readFileSync(new URL('../.github/workflows/recover-beta-mixed-release-20261010.yml',import.meta.url),'utf8');
 assert.match(workflow,/environment: beta/);
 assert.match(workflow,/group: misechef-beta-deployment/);
 assert.match(workflow,/runBetaProtectedTests/);
 assert.match(workflow,/test:store-sets:rules/);
 assert.match(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA/);
 assert.doesNotMatch(workflow,/FIREBASE_SERVICE_ACCOUNT_MISECHEF_PRODUCTION/);
});
