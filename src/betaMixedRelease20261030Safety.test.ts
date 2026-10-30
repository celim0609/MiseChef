import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('incident-scoped Beta recovery retains exact-state and release-completion gates',()=>{
  execFileSync(process.execPath,['--test','scripts/betaMixedRelease20261030Recovery.test.mjs'],{stdio:'inherit'});
});
