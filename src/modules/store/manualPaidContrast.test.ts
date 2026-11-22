import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const theme=readFileSync(new URL('../../index.css',import.meta.url),'utf8');
const manual=readFileSync(new URL('./manualPosOrders.css',import.meta.url),'utf8');
const declarations=(source:string,selector:string)=>{
 const start=source.indexOf(selector+' {');assert.ok(start>=0,`Missing scoped surface rule: ${selector}`);
 return Object.fromEntries([...source.slice(start,source.indexOf('}',start)).matchAll(/([\w-]+):\s*(#[a-fA-F0-9]{6}|white|black)\b/g)].map(m=>[m[1],m[2]==='white'?'#ffffff':m[2]==='black'?'#000000':m[2]]));
};
const luminance=(hex:string)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const aa=(a:string,b:string)=>{assert.ok(a&&b,'Both foreground and surface must be owned');const x=luminance(a),y=luminance(b);assert.ok((Math.max(x,y)+.05)/(Math.min(x,y)+.05)>=4.5,`${a} on ${b} must meet AA`);};
test('populated manual paid accordion and saved details own a contrasting Night Mode surface',()=>{
 const surface=declarations(theme,'.pos-screen[data-pos-theme="dark"] .manual-pos > .manual-section');
 aa(surface.color,surface['background-color']);
 const muted=declarations(theme,'.pos-screen[data-pos-theme="dark"] .manual-pos .manual-muted:where(:not(.manual-dialog *))');
 aa(muted.color,surface['background-color']);
});
test('paid badges and View details buttons retain AA foreground/background pairs in both modes',()=>{
 for(const selector of ['.manual-pos .manual-paid','.manual-pos .manual-secondary']){
  const d=declarations(manual,selector);aa(d.color,d.background);
 }
});
test('the modal keeps its separate light surface and dark foreground',()=>{
 const dialog=declarations(theme,'.pos-screen[data-pos-theme="dark"] .manual-pos .manual-dialog');
 aa(dialog.color,'#f8fafc');
 assert.match(theme,/\.manual-pos > \.manual-section/);
});
