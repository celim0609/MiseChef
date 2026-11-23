import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const css=readFileSync(new URL('../../index.css',import.meta.url),'utf8');
const page=readFileSync(new URL('./StorePosPage.tsx',import.meta.url),'utf8');
test('dashboard dark and system-dark overrides exclude POS descendants without raising outside specificity',()=>{
 const overrides=css.slice(css.indexOf(':root[data-appearance="dark"] .bg-white'),css.indexOf('.glass'));
 for(const line of overrides.split('\n').filter(line=>/data-appearance/.test(line))) assert.ok(line.includes(':where(:not(.pos-screen *))'),line);
});
test('period tabs have explicit selected and unselected text colours; no disabled fake tabs',()=>{
 const nav=page.slice(page.indexOf('<nav aria-label="Fulfilment period"'),page.indexOf('</nav>',page.indexOf('<nav aria-label="Fulfilment period"')));
 for(const value of ['aria-pressed','text-white','text-slate-100','text-slate-900','selectDailyView']) assert.ok(nav.includes(value),value);
 assert.ok(!nav.includes('disabled='));
});
test('local POS theme resets inherited dashboard tokens and covers focus, genuine disabled and Completed states',()=>{
 for(const value of ['--color-on-surface: #1b1c1a','--color-background: #faf9f5','--color-outline: #475569','.manual-muted:where(:not(.manual-dialog *))','.manual-pos .manual-dialog { color: #0f172a; }','summary):focus-visible','button:disabled','border-style: dashed','.pos-completed','max-width: 639px']) assert.ok(css.includes(value),value);
 assert.ok(page.includes('pos-readable-heading text-xl font-bold">Daily fulfilments'));
});

test('POS notification count has its own solid background with AA text contrast',()=>{
 const rule=css.match(/\.pos-screen \.bg-error \{ background-color: (#[a-f0-9]{6}); color: (#[a-f0-9]{6}); \}/);
 assert.ok(rule,'Notification badge must not rely on an undefined shared error token');
 const luminance=(hex:string)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 const a=luminance(rule[1]),b=luminance(rule[2]);
 assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
});
