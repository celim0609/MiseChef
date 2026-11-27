import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const source=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function handlers(text:string){
 const file=ts.createSourceFile('component.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),printer=ts.createPrinter(),values:string[]=[];
 function visit(node:ts.Node){if(ts.isJsxAttribute(node)&&['onChange','onClick','disabled','min','max','step','maxLength','multiple'].includes(node.name.getText(file))){const value=printer.printNode(ts.EmitHint.Unspecified,node,file);if(!/setProductSearch|setProductCategory/.test(value))values.push(value);}ts.forEachChild(node,visit);}visit(file);return values.sort().join('\n');
}
test('Manual workspace preserves every existing input, payment, fulfilment and submission handler',()=>assert.equal(hash(handlers(source)),'6249ff3f0062e065ddaad859a14a766c606a6f81620d0c47b228fcc489e6301f'));
test('Pending Payments markup and completed layout remain byte-identical',()=>{
 assert.equal(hash(source.slice(source.indexOf('      {(!refined || (showPending'),source.indexOf('      {saved && ('))),'7cda8e3747207007896e362e5903a012609f9d5a8f3c47c200fdbe81d4ddc327');
 const css=readFileSync(new URL('./posRefinement.css',import.meta.url),'utf8');assert.equal(hash(css.slice(0,css.indexOf('\n/* Manual Order workspace only.'))),'23ebc2cc5befed589122c45d203a04e025446a0285d097e1402284cac94bd9ce');
});
const pickerStart=source.indexOf('              <fieldset disabled={busy || !slug}');
const pickerEnd=source.indexOf('              </fieldset>',pickerStart)+'              </fieldset>'.length;
const searchDeclaration=source.match(/  const matchesProductSearch=.*;/)![0];
const pickerModule:any={};
const code=ts.transpileModule(`export default function Picker({products,sets=[],privateItems=[],productCategory='menu',productSearch=''}){const input='',busy=false,slug='s';${searchDeclaration}return ${source.slice(pickerStart,pickerEnd)};}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
new Function('exports','React',code)(pickerModule,React);const Picker=pickerModule.default;
const products=[{id:'regular',name:'Mochi Cloud',price:18.90},{id:'weekly',name:'Weekly Lunch',price:60,productType:'weekly_meal_plan'}];
test('Search keeps menu and weekly plans separate without changing selection IDs',()=>{
 const menu=renderToStaticMarkup(<Picker products={products} productSearch="MOCHI"/>);assert.match(menu,/value="regular"/);assert.ok(!menu.includes('value="weekly"'));
 const weekly=renderToStaticMarkup(<Picker products={products} productCategory="weekly" productSearch="lunch"/>);assert.match(weekly,/value="weekly"/);assert.ok(!weekly.includes('value="regular"'));
});
test('Filtered sets and private items retain their original selection identifiers',()=>{
 const sets=renderToStaticMarkup(<Picker products={products} sets={[{id:'set-a',name:'Breakfast'},{id:'set-b',name:'Lunch'}]} productCategory="sets" productSearch="lunch"/>);assert.match(sets,/value="set-b"/);assert.ok(!sets.includes('value="set-a"'));
 const items=renderToStaticMarkup(<Picker products={products} privateItems={[{name:'Soup'},{name:'Rice'},{name:'Special lunch'}]} productCategory="private" productSearch="special"/>);assert.match(items,/value="2"/);assert.ok(!items.includes('value="0"'));
});
test('Manual workspace formats MYR as RM while preserving cents and other currencies',()=>{
 const money=source.match(/  const money = .*;/)![0],display=source.match(/  const displayMoney=.*;/)![0];
 const js=ts.transpileModule(`function format(currency,refined,minor){${money}\n${display}\nreturn displayMoney(minor);}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const format=new Function(js+';return format;')();
 assert.equal(format('MYR',true,5922),'RM 59.22');assert.equal(format('MYR',true,0),'RM 0.00');assert.equal(format('SGD',true,5922),'SGD 59.22');assert.equal(format('MYR',false,5922),'MYR 59.22');
});
