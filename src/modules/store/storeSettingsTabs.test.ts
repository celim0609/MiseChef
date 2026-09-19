import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storePage = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

test('Store Settings keeps every configuration area in a persistent tab panel', () => {
  for (const [id, label] of [
    ['general', 'General'],
    ['payments', 'Payments'],
    ['pickup-delivery', 'Pickup & Delivery'],
    ['contact', 'Contact'],
    ['host-program', 'Host Program']
  ]) {
    assert.match(storePage, new RegExp(`id: '${id}', label: '${label}'`));
    assert.match(storePage, new RegExp(`hidden=\\{settingsTab !== '${id}'\\}`));
  }
});

test('Pickup and Store Settings preserve their separate submit handlers', () => {
  assert.match(storePage, /<form onSubmit=\{handlePickupSave\}/);
  assert.match(storePage, /<form onSubmit=\{handleSettingsSave\}/);
  assert.doesNotMatch(storePage, /onSubmit=\{handlePickupSave\}[\s\S]{0,120}handleSettingsSave/);
});


test('Store Settings remains usable when an ancillary catalog read is denied', () => {
  assert.match(storePage, /Promise\.allSettled\(\[/);
  assert.match(storePage, /productsResult\.status === 'fulfilled' \? productsResult\.value : \[\]/);
  assert.match(storePage, /optionGroupsResult\.status === 'fulfilled' \? optionGroupsResult\.value : \[\]/);
  assert.match(storePage, /setsResult\.status === 'fulfilled' \? setsResult\.value : \[\]/);
  assert.match(storePage, /load failed without blocking Store Settings/);
});
