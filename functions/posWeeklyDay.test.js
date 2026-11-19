import test from 'node:test';
import assert from 'node:assert/strict';
import { posStoreDate, posWeekMonday, resolvePosWeeklyDay, resolvePosAddOrderMeal } from './posWeeklyDay.js';

test('each day from Monday through Sunday resolves to the same Store calendar week', () => {
  for (let day = 16; day <= 22; day++) assert.equal(posWeekMonday(`2026-11-${day}`), '2026-11-16');
  assert.equal(posWeekMonday('2027-01-01'), '2026-12-28');
  assert.equal(posWeekMonday('2026-02-30'), '');
});

test('Store-local week changes at Kuala Lumpur midnight independently of the UTC date', () => {
  const store = { country: 'MY' };
  assert.equal(posWeekMonday(posStoreDate(store, new Date('2026-11-15T15:59:59.999Z'))), '2026-11-09');
  assert.equal(posWeekMonday(posStoreDate(store, new Date('2026-11-15T16:00:00Z'))), '2026-11-16');
  assert.equal(posStoreDate(store, new Date('2026-11-16T00:00:00Z')), '2026-11-16');
  assert.equal(posStoreDate({ ...store, timeZone: 'UTC' }, new Date('2026-11-15T16:00:00Z')), '2026-11-15');
});

test('exact dated menu prices are used in the past, today and future with no fallback', () => {
  const entry = (startMonday, price) => ({
    startMonday, meals: { tue: { name: `Meal ${startMonday}`, photoUrl: 'meal.jpg', price } },
  });
  const plan = { weeklyMenuVersion: 2, weeklyWeeks: {
    week1: entry('2026-11-09', 9), week2: entry('2026-11-16', 16), week3: entry('2026-11-23', 23),
  } };
  const resolve = date => resolvePosWeeklyDay(plan, [], date, '2026-11-17');
  assert.equal(resolve('2026-11-10').meal.price, 9);
  assert.equal(resolve('2026-11-17').meal.price, 16);
  assert.equal(resolve('2026-11-24').meal.price, 23);
  assert.match(resolve('2026-11-03').error, /historical menu/);
  assert.match(resolve('2026-11-29').error, /Monday through Friday/);
  assert.match(resolve('2026-12-01').error, /No configured meal/);
});

test('rotation handles current and future dates but cannot establish a historical price', () => {
  const meal = { name: 'Rotation meal', photoUrl: 'meal.jpg', price: 19 };
  const plan = { weeklyMenuVersion: 3, rotationStartMonday: '2026-10-12',
    rotationWeeks: { week1: { meals: { tue: meal } } }, healthyLunchBlockedDates: ['2026-11-17'] };
  const resolve = date => resolvePosWeeklyDay(plan, [], date, '2026-11-17');
  assert.equal(resolve('2026-11-17').meal.price, 19);
  assert.equal(resolve('2026-11-24').meal.price, 19);
  assert.match(resolve('2026-11-10').error, /historical menu/);
});

test('Add Order retained meal source is independent of service history, without relaxing historical pricing', () => {
  const plan = { weeklyMenuVersion: 3, rotationStartMonday: '2026-10-12', rotationWeeks: {
    week3: { meals: { mon: { name: 'Retained Monday', photoUrl: 'meal.jpg', price: 12.9 } } },
  } };
  for (const source of ['2026-10-12', '2026-11-16', '2026-11-23']) {
    for (const service of ['2026-11-19', '2026-11-21', '2026-12-06']) {
      const result = resolvePosAddOrderMeal(plan, [], source, service, '2026-11-19');
      assert.equal(result.meal.name, 'Retained Monday');
      assert.equal(result.meal.price, 12.9);
    }
    assert.match(resolvePosAddOrderMeal(plan, [], source, '2026-11-18', '2026-11-19').error, /historical menu/);
  }
  assert.match(resolvePosAddOrderMeal(plan, [], '2026-11-22', '2026-11-23', '2026-11-19').error, /Monday through Friday/);
  assert.match(resolvePosAddOrderMeal(plan, [], '2026-11-17', '2026-11-21', '2026-11-19').error, /No configured meal/);
  assert.match(resolvePosWeeklyDay(plan, [], '2026-11-16', '2026-11-19').error, /historical menu/);
});

test('custom weekend fulfilments use the Store timezone and classify history by actual fulfilment', async () => {
  const { hasHistoricalWeeklyDay, posScheduleTime } = await import('./posWeeklyDay.js');
  const selection = { healthyLunchDate: '2026-11-10' };
  assert.equal(hasHistoricalWeeklyDay([selection], '2026-11-17', [{ date: '2026-11-15' }]), true);
  assert.equal(hasHistoricalWeeklyDay([selection], '2026-11-17', [{ date: '2026-11-21' }]), false);
  assert.equal(posScheduleTime({ country: 'MY' }, '2026-11-21', '00:00'), Date.parse('2026-11-20T16:00:00Z'));
  assert.equal(posScheduleTime({ timeZone: 'UTC' }, '2026-11-22', '15:10'), Date.parse('2026-11-22T15:10:00Z'));
});

test('all Add Order types classify history by actual service date, not weekly source date', async () => {
  const { hasHistoricalPosDate } = await import('./posWeeklyDay.js');
  const selections = [{ productId: 'cake' }, { productId: 'menu', healthyLunchDate: '2026-11-10' }];
  const input = { selections, fulfilmentDate: '2026-11-21', lineSchedules: [{ date: '' }, { date: '2026-11-22' }] };
  assert.equal(hasHistoricalPosDate(input, '2026-11-19'), false);
  assert.equal(hasHistoricalPosDate({ ...input, fulfilmentDate: '2026-11-18' }, '2026-11-19'), true);
  assert.equal(hasHistoricalPosDate({ ...input, fulfilmentDate: '2026-11-19' }, '2026-11-19'), false);
  assert.equal(hasHistoricalPosDate({ ...input, fulfilmentDate: '2026-02-30' }, '2026-11-19'), false);
});
