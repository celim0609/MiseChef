import {createRequire} from 'node:module';
import {verifyHistoryDeployment} from '../functions/posHistoryDeployment.js';
import {initializeApp, applicationDefault} from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import {getFirestore} from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import {runHistoryBackfill,validateHistoryBackfillOptions} from '../functions/posHistoryBackfill.js';
try {
const args=new Map();
const flags=new Set(['--execute','--restart']);
const values=new Set(['--project','--candidate','--confirm','--max-orders','--max-writes','--page-size','--max-run-ms']);
for(const argument of process.argv.slice(2)){
 const split=argument.indexOf('=');const key=split<0?argument:argument.slice(0,split);const value=split<0?true:argument.slice(split+1);
 if(args.has(key) || (!flags.has(key) && !values.has(key)))throw new Error(`Unknown or repeated option: ${key}`);
 if(flags.has(key) ? value!==true : value===true || value==='')throw new Error(`Invalid value for ${key}; use --option=value.`);
 args.set(key,value);
}
const options={projectId:args.get('--project'),candidate:args.get('--candidate'),execute:args.has('--execute'),confirmation:args.get('--confirm'),restart:args.has('--restart'),maxOrders:Number(args.get('--max-orders')||100),maxWrites:Number(args.get('--max-writes')||500),pageSize:Number(args.get('--page-size')||25),maxRunMs:Number(args.get('--max-run-ms')||120000)};
validateHistoryBackfillOptions(options);
if(options.projectId==='misechef-fa4bf' && process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Refusing Production backfill with emulator routing.');
if(options.execute){
 const origin=options.projectId==='misechef-fa4bf'?'https://misechef.ai':'https://misechef-beta-fa4bf.web.app';
 const name=options.projectId==='misechef-fa4bf'?'production':'beta';
 const response=await fetch(`${origin}/.well-known/misechef-${name}-release.json`,{headers:{'Cache-Control':'no-cache'}});
 if(!response.ok || (await response.json()).sourceCommit!==options.candidate)throw new Error('Live code fingerprint does not match the approved backfill candidate.');
}
if(options.execute){
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {GoogleAuth}=require('google-auth-library');
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
 const client=await auth.getClient();
 await verifyHistoryDeployment({request:request=>client.request(request),projectId:options.projectId});
}
initializeApp({credential:applicationDefault(),projectId:options.projectId});
console.log(JSON.stringify(await runHistoryBackfill({db:getFirestore(),options}),null,2));

} catch(error) { console.error(error.message); process.exitCode=1; }
