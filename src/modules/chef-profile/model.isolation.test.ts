import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyChefProfile, resolveOwnedChefProfile } from './model';

test('Chef Profile state remains isolated across an A to B to A account switch', () => {
  const userA = emptyChefProfile('user-a');
  userA.basicInfo.fullName = 'User A';
  userA.basicInfo.summary = 'Private summary A';
  userA.experiences = [{
    id: 'role-a', jobTitle: 'Executive Chef', companyName: 'Private Employer A', currentlyWorking: true
  }];

  const documents = new Map([['user-a', userA]]);
  const loadFor = (uid: string) => resolveOwnedChefProfile(uid, documents.get(uid));

  const firstA = loadFor('user-a');
  assert.equal(firstA.basicInfo.fullName, 'User A');
  assert.equal(firstA.basicInfo.summary, 'Private summary A');

  const userB = loadFor('user-b');
  assert.equal(userB.userId, 'user-b');
  assert.equal(userB.basicInfo.fullName, '');
  assert.equal(userB.basicInfo.summary, undefined);
  assert.deepEqual(userB.experiences, []);

  const secondA = loadFor('user-a');
  assert.equal(secondA.userId, 'user-a');
  assert.equal(secondA.basicInfo.fullName, 'User A');
  assert.equal(secondA.experiences[0].companyName, 'Private Employer A');
});

test('a profile document whose embedded owner differs from the active UID is rejected', () => {
  const userA = emptyChefProfile('user-a');
  userA.basicInfo.summary = 'Never show this to B';
  assert.throws(
    () => resolveOwnedChefProfile('user-b', userA),
    /ownership mismatch/i
  );
});
