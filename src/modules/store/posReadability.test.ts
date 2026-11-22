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
 for(const value of ['aria-pressed','text-white','text-slate-100','text-slate-900','setDailyView']) assert.ok(nav.includes(value),value);
 assert.ok(!nav.includes('disabled='));
});
test('local POS theme resets inherited dashboard tokens and covers focus, genuine disabled and Completed states',()=>{
 for(const value of ['--color-on-surface: #1b1c1a','--color-background: #faf9f5','summary):focus-visible','button:disabled','border-style: dashed','.pos-completed','max-width: 639px']) assert.ok(css.includes(value),value);
 assert.ok(page.includes('pos-readable-heading text-xl font-bold">Daily fulfilments'));
});
