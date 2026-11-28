import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
const effect=source.slice(source.indexOf('  const handledCreate ='),source.indexOf('  const input = "rounded border'));
const js=ts.transpileModule(effect,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const render=new Function('useRef','useEffect','createRequest','onCreateConsumed','setSaved','load',js);
test('manual creation requests run once, can be repeated intentionally and do not reopen after navigation remount',()=>{
 let ref={current:0},loads=0,consumed=0;
 const run=(request:number)=>render(()=>ref,(fn:()=>void)=>fn(),request,()=>{consumed++;},()=>{},()=>{loads++;});
 run(0);assert.equal(loads,0);
 run(1);run(1);assert.equal(loads,1);assert.equal(consumed,1);
 run(0);run(1);assert.equal(loads,2);assert.equal(consumed,2);
 run(0);ref={current:0};run(0);assert.equal(loads,2);
});
