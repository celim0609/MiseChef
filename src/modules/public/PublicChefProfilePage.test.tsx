import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicChefSocialLinks } from './PublicChefSocialLinks';

test('public Chef Profile renders only validated supported social platforms', () => {
  const markup = renderToStaticMarkup(<PublicChefSocialLinks socialLinks={{
    instagram: 'https://instagram.com/misechef',
    youtube: 'https://vimeo.com/not-youtube',
    website: 'https://chef.example',
    personalWebsite: 'https://legacy.example'
  }} />);
  assert.match(markup, /instagram\.com\/misechef/);
  assert.match(markup, /noopener noreferrer/);
  assert.doesNotMatch(markup, /vimeo|chef\.example|legacy\.example|website/i);
});

test('public Chef Profile omits the social section when no safe links remain', () => {
  assert.equal(renderToStaticMarkup(<PublicChefSocialLinks socialLinks={{ website: 'https://chef.example' }} />), '');
});
