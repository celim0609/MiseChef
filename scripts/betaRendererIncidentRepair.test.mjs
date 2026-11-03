import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RENDERER_INCIDENT as i, repairKnownBetaRendererIncident, inspectRendererImage } from './betaRendererIncidentRepair.mjs';

const fixture = () => {
  let changed = false;
  const calls = [];
  const live = {releaseCommit:i.liveCommit,releaseSourceTree:i.liveTree,releaseProtectedBaseline:i.baseline,releaseBuildId:i.buildId,rootAsset:i.asset,storeAsset:i.oldAsset,rootEtag:'unchanged',fingerprint:'before'};
  const manifest = {sourceCommit:i.liveCommit,sourceTree:i.liveTree,protectedBaseline:i.baseline,buildId:i.buildId,entryAsset:i.asset,storeShellAsset:i.asset,entryAssetSha256:i.assetSha256};
  const service = {metadata:{name:i.service,namespace:'16155495480'},spec:{traffic:[{percent:100,revisionName:i.pinnedRevision}]},status:{latestCreatedRevisionName:i.targetRevision,latestReadyRevisionName:i.pinnedRevision,traffic:[{percent:100,revisionName:i.pinnedRevision}]}};
  const revision = {metadata:{name:i.targetRevision,namespace:'16155495480',labels:{'serving.knative.dev/service':i.service}},spec:{containers:[{image:i.image}]},status:{conditions:[{type:'Ready',status:'True'}]}};
  const args = {env:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'celim0609/MiseChef',GITHUB_REF:'refs/heads/main',FIREBASE_DEPLOY_TARGET:'beta',MISECHEF_BETA_CI_LOCK_ID:'misechef-beta-deployment'},head:'a'.repeat(40),isAncestor:()=>true,
    readLive:async()=>structuredClone(changed?{...live,storeAsset:i.asset,fingerprint:'after'}:live),
    fetchImpl:async url=>url.endsWith('.json')?new Response(JSON.stringify(manifest),{headers:{'content-type':'application/json'}}):new Response('approved asset',{headers:{'content-type':'text/javascript'}}),
    hashAsset:()=>i.assetSha256, inspectImage:()=>`<script src="${i.asset}"></script>`,
    run:(binary,params)=>{
      calls.push({binary,params});
      if(params.includes('update-traffic')){changed=true;return '';}
      if(params.includes('describe'))return JSON.stringify(params.includes('revisions')?revision:changed?{...service,spec:{traffic:[{percent:100,latestRevision:true}]},status:{...service.status,latestReadyRevisionName:i.targetRevision,traffic:[{percent:100,revisionName:i.targetRevision}]}}:service);
      return '';
    }
  };
  return {args,live,manifest,service,revision,calls};
};
test('exact incident repair inspects image, preserves Hosting identity, and removes the persistent traffic pin', async()=>{
  const f=fixture();const after=await repairKnownBetaRendererIncident(f.args);
  assert.equal(after.storeAsset,i.asset);assert.equal(after.releaseCommit,i.liveCommit);
  const writes=f.calls.filter(call=>call.params.includes('update-traffic'));
  assert.equal(writes.length,1);assert.deepEqual(writes[0].params,['run','services','update-traffic',i.service,'--to-latest',`--project=${i.project}`,`--region=${i.region}`,'--quiet']);
});
for(const [name,change] of [
  ['local invocation',f=>f.args.env.GITHUB_ACTIONS='false'],
  ['Production target',f=>f.args.env.FIREBASE_DEPLOY_TARGET='production'],
  ['unlocked run',f=>f.args.env.MISECHEF_BETA_CI_LOCK_ID='wrong'],
  ['wrong repository',f=>f.args.env.GITHUB_REPOSITORY='other/repo'],
  ['feature controller',f=>f.args.env.GITHUB_REF='refs/heads/feature'],
  ['divergent candidate',f=>f.args.isAncestor=()=>false],
  ['changed live commit',f=>f.live.releaseCommit='b'.repeat(40)],
  ['changed manifest asset hash',f=>f.manifest.entryAssetSha256='wrong'],
  ['changed traffic',f=>f.service.spec.traffic[0].percent=99],
  ['unexpected newer revision',f=>f.service.status.latestCreatedRevisionName='newer'],
  ['unready target',f=>f.revision.status.conditions[0].status='False'],
  ['wrong immutable image',f=>f.revision.spec.containers[0].image='wrong'],
  ['wrong image shell',f=>f.args.inspectImage=()=>'<script src="/assets/index-wrong.js"></script>'],
  ['wrong served bytes',f=>f.args.hashAsset=()=> 'wrong'],
  ['HTML instead of JavaScript',f=>f.args.fetchImpl=async url=>url.endsWith('.json')?new Response(JSON.stringify(f.manifest)):new Response('<html>',{headers:{'content-type':'text/html'}})],
  ['race before mutation',f=>{let reads=0;f.args.readLive=async()=>({...f.live,rootEtag:++reads===1?'unchanged':'changed'});}]
]) test(`renderer repair refuses ${name} before any traffic change`,async()=>{
  const f=fixture();change(f);await assert.rejects(repairKnownBetaRendererIncident(f.args));
  assert.equal(f.calls.filter(call=>call.params.includes('update-traffic')).length,0);
});
test('immutable image inspection reads files offline, rejects duplicate shells, and never starts a container',()=>{
  for(const duplicate of [false,true]){
    const calls=[];
    const run=(binary,args)=>{
      calls.push(args[0]);
      if(args[0]==='create')return 'a'.repeat(64);
      if(args[0]==='cp'){
        writeFileSync(args[2]+'/publicStoreAppShell.html',`<script src="${i.asset}"></script>`);
        if(duplicate){mkdirSync(args[2]+'/duplicate');writeFileSync(args[2]+'/duplicate/publicStoreAppShell.html','duplicate');}
      }
      return '';
    };
    if(duplicate)assert.throws(()=>inspectRendererImage(i.image,run),/Exactly one/);else assert.match(inspectRendererImage(i.image,run),/index-C2bCr1fA/);
    assert.deepEqual(calls,['create','cp','rm']);
  }
});
