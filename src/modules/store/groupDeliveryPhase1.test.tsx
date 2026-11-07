import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import GroupDeliveryProgress from './GroupDeliveryProgress';
import { resolvePublicRoute } from '../public/publicRoutes';
import { isValidPublicAccountReturnTo } from '../public/hostReturnNavigation';

test('dedicated delivery route and sign-in return preserve date without changing Host route', () => {
  assert.deepEqual(resolvePublicRoute('/store/lunch/group-delivery'),{page:'group-delivery',slug:'lunch'});
  assert.deepEqual(resolvePublicRoute('/group/host-code'),{page:'group',shareCode:'host-code'});
  assert.equal(isValidPublicAccountReturnTo('/store/lunch/group-delivery?date=2026-11-03'),true);
  assert.equal(isValidPublicAccountReturnTo('/store/lunch/group-delivery?date=2026-11-03&area=pakatan-bercham-raya'),true);
  assert.equal(isValidPublicAccountReturnTo('//evil.test/store/lunch/group-delivery'),false);
  assert.equal(isValidPublicAccountReturnTo('/store/lunch/group-delivery?redirect=https://evil.test'),false);
});
test('bilingual progress clearly distinguishes unpaid portions, owner review and free delivery', () => {
  const markup=renderToStaticMarkup(<GroupDeliveryProgress progress={{available:true,paidPortions:10,status:'ready_for_review',closesAt:'2026-11-03T02:00:00.000Z'}} />);
  for(const label of ['10 / 10','午餐份数','Awaiting Owner/Manager review','仅计入已确认付款的午餐','RM0','获批','MYT']) assert.ok(markup.includes(label),label);
  assert.ok(!markup.includes('pay now'));
});
