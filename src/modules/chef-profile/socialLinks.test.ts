import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getChefSocialLinksValidationError, normalizeChefSocialUrl, preserveLegacyChefWebsiteLinks, sanitizeChefSocialLinks } from './socialLinks';

test('Chef Profile social links accept only HTTPS URLs on the selected platform', () => {
  assert.equal(normalizeChefSocialUrl('instagram', 'https://www.instagram.com/misechef'), 'https://www.instagram.com/misechef');
  assert.equal(normalizeChefSocialUrl('tiktok', 'https://tiktok.com/@misechef'), 'https://tiktok.com/@misechef');
  assert.equal(normalizeChefSocialUrl('facebook', 'https://fb.com/misechef'), 'https://fb.com/misechef');
  assert.equal(normalizeChefSocialUrl('linkedin', 'https://my.linkedin.com/in/chef'), 'https://my.linkedin.com/in/chef');
  assert.equal(normalizeChefSocialUrl('youtube', 'https://youtu.be/video'), 'https://youtu.be/video');
});

test('Chef Profile social links reject HTTP, mismatched domains, and deceptive hosts', () => {
  assert.equal(normalizeChefSocialUrl('instagram', 'http://instagram.com/misechef'), '');
  assert.equal(normalizeChefSocialUrl('instagram', 'https://facebook.com/misechef'), '');
  assert.equal(normalizeChefSocialUrl('facebook', 'https://facebook.com.evil.test/misechef'), '');
  assert.match(getChefSocialLinksValidationError({ youtube: 'https://vimeo.com/video' }), /YouTube must use an HTTPS/);
});

test('social sanitization drops arbitrary and legacy website fields', () => {
  assert.deepEqual(sanitizeChefSocialLinks({
    instagram: 'https://instagram.com/misechef',
    website: 'https://chef.example',
    personalWebsite: 'https://legacy.example',
    custom: 'https://elsewhere.example'
  }), { instagram: 'https://instagram.com/misechef' });
});

test('Chef Profile Builder exposes only the five supported social fields', () => {
  const source = readFileSync(new URL('./ChefProfilePage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Personal website/);
  assert.match(source, /CHEF_SOCIAL_PLATFORMS\.map/);
});

test('existing legacy website values can be preserved without accepting them as safe social links', () => {
  assert.deepEqual(preserveLegacyChefWebsiteLinks({
    website: 'https://chef.example',
    personalWebsite: 'https://legacy.example',
    custom: 'https://custom.example'
  }, { instagram: 'https://instagram.com/misechef' }), {
    instagram: 'https://instagram.com/misechef',
    website: 'https://chef.example',
    personalWebsite: 'https://legacy.example'
  });
});
