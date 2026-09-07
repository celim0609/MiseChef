import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PublicAboutPage.tsx', import.meta.url), 'utf8');

test('About Us uses the approved factual positioning and business identity', () => {
  assert.match(source, /MiseChef is a food technology and software platform operated by CL WISE EMPIRE in Malaysia\./);
  assert.match(source, /The platform provides subscription-based digital tools for chefs and food businesses, including recipe management, food costing, kitchen and business operations, alongside public recipe, chef and online store experiences\./);
  assert.match(source, /MiseChef also enables food businesses to present their products and receive customer orders through their public store pages\./);
  assert.match(source, /Brand:<\/dt> <dd className="inline">MiseChef/);
  assert.match(source, /Operator:<\/dt> <dd className="inline">CL WISE EMPIRE/);
  assert.match(source, /Business Registration No\.:<\/dt> <dd className="inline">202603223516 \(003882452-K\)/);
  assert.match(source, /Country:<\/dt> <dd className="inline">Malaysia/);
  assert.doesNotMatch(source, /GG Grab n Go|licensed|regulated|certified|payment provider/i);
});
