import test from 'node:test';import{execFileSync}from'node:child_process';
test('canonical Beta deployment refuses incomplete Firebase CLI success',()=>{execFileSync(process.execPath,['--test','scripts/betaFirebaseCompletionSafety.test.mjs'],{stdio:'inherit'});});
