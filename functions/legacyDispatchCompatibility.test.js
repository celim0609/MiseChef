import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dispatchCompatibilityProject,retiredDispatchHttp,inertDispatchEvent} from './legacyDispatchCompatibility.js';
const contracts=JSON.parse(readFileSync(new URL('./deployedFunctionTriggerContracts.json',import.meta.url)));
for(const project of Object.keys(contracts)) test(`${project}: actual SDK endpoint manifest preserves every deployed trigger family`,()=>{
 const env={...process.env,GCLOUD_PROJECT:project,FIREBASE_CONFIG:JSON.stringify({projectId:project})};delete env.GOOGLE_CLOUD_PROJECT;
 const source=`const m=await import('./entry.js'); console.log(JSON.stringify(Object.fromEntries(Object.entries(m).filter(([,f])=>f.__endpoint).map(([name,f])=>[name,f.__endpoint.eventTrigger?.eventType||'https']))));`;
 const actual=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('.',import.meta.url),env,encoding:'utf8'}));
 for(const [name,type] of Object.entries(contracts[project])) assert.equal(actual[name],type,`${name}: trigger-type migration requires a separate reviewed name`);
});
test('retired HTTP and Firestore transports cannot book, read or modify any order',async()=>{
 let status,body;const response={status(code){status=code;return this;},json(value){body=value;return this;}};
 retiredDispatchHttp(new Proxy({}, {get(){throw Error('Request must not be read');}}),response);
 assert.equal(status,410);assert.equal(body.code,'MANUAL_DISPATCH_REQUIRED');
 assert.equal(await inertDispatchEvent(new Proxy({}, {get(){throw Error('Event must not be read');}})),undefined);
});
test('legacy dispatch project resolution rejects unknown, conflicting and malformed identities',()=>{
 assert.equal(dispatchCompatibilityProject({FIREBASE_CONFIG:'{"projectId":"misechef-fa4bf"}'}),'misechef-fa4bf');
 assert.equal(dispatchCompatibilityProject({GCLOUD_PROJECT:'misechef-beta-fa4bf'}),'misechef-beta-fa4bf');
 for(const env of [{},{GCLOUD_PROJECT:'other'},{FIREBASE_CONFIG:'bad'},{GCLOUD_PROJECT:'misechef-fa4bf',FIREBASE_CONFIG:'{"projectId":"misechef-beta-fa4bf"}'}]) assert.throws(()=>dispatchCompatibilityProject(env));
});
