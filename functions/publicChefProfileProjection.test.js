import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicChefProfileProjection, normalizePublicChefSocialUrl } from './publicChefProfileProjection.js';

test('public Chef Profile projection validates each supported social domain', () => {
  assert.equal(normalizePublicChefSocialUrl('facebook', 'https://fb.com/misechef'), 'https://fb.com/misechef');
  assert.equal(normalizePublicChefSocialUrl('youtube', 'https://youtube.com/@misechef'), 'https://youtube.com/@misechef');
  assert.equal(normalizePublicChefSocialUrl('linkedin', 'http://linkedin.com/in/chef'), '');
  assert.equal(normalizePublicChefSocialUrl('instagram', 'https://tiktok.com/@chef'), '');
});

test('public Chef Profile projection excludes legacy websites and mismatched social URLs', () => {
  const projection = buildPublicChefProfileProjection({
    visibility: 'public',
    profileSlug: 'chef-ada',
    basicInfo: { fullName: 'Chef Ada', professionalTitle: 'Chef' },
    socialLinks: {
      instagram: 'https://instagram.com/chef-ada',
      youtube: 'https://example.com/video',
      website: 'https://chef.example',
      personalWebsite: 'https://legacy.example'
    }
  });
  assert.deepEqual(projection.socialLinks, { instagram: 'https://instagram.com/chef-ada' });
  assert.doesNotMatch(JSON.stringify(projection), /chef\.example|legacy\.example/);
});
