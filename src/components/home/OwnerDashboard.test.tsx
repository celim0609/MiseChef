import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { calculateBusinessAccounting } from '../../modules/business/accounting';
import type { BusinessSale } from '../../modules/business/types';
import { OwnerMetricSection, type OwnerMetricCard } from './OwnerHomeWidgets';
import OwnerSalesPerformance from './OwnerSalesPerformance';

test('Business Home defines the three requested KPIs once and keeps the supporting dashboard sections', () => {
  const source = readFileSync(new URL('../HomeTab.tsx', import.meta.url), 'utf8');

  for (const label of ['Total Revenue', 'Approved Purchases', 'Purchase Ratio']) {
    assert.equal(source.match(new RegExp(`label: '${label}'`, 'g'))?.length, 1, label);
  }
  assert.match(source, /<OwnerHomeHeader[\s\S]*title="Financial overview"[\s\S]*<OwnerSalesPerformance[\s\S]*title="Daily Operations"[\s\S]*<TodaysTasks[\s\S]*<OwnerQuickActions[\s\S]*<OwnerNeedsAttention[\s\S]*<OwnerRecentActivity[\s\S]*<OwnerBusinessSnapshot/);
  assert.doesNotMatch(source, /Net Profit|Gross Profit|COGS/);
});

test('Sales Performance exposes each recognized daily total, with dates and signed values', () => {
  const manualSales: BusinessSale[] = [
    { id: 'one', date: '2026-11-01', amount: 123.45, notes: '', workspaceId: 'fixture', createdAt: '', updatedAt: '', createdBy: '' },
    { id: 'three', date: '2026-11-03', amount: -7.89, notes: '', workspaceId: 'fixture', createdAt: '', updatedAt: '', createdBy: '' }
  ];
  const { salesTrend } = calculateBusinessAccounting({
    from: '2026-11-01', to: '2026-11-03', timeZone: 'Asia/Singapore',
    invoices: [], storeOrders: [], manualSales
  });
  const markup = renderToStaticMarkup(
    <OwnerSalesPerformance trend={salesTrend} state="ready" currency="SGD" locale="en-SG" onViewSales={() => {}} />
  );
  assert.match(markup, /<button[^>]+>Sales Records/);
  assert.match(markup, /<details.*<summary.*View daily sales values/);
  assert.match(markup, /dateTime="2026-11-01".*SGD 123\.45.*dateTime="2026-11-02".*SGD 0\.00.*dateTime="2026-11-03".*SGD -7\.89/);
});

test('Sales Performance keeps unavailable data out of the chart and hides unauthorized navigation', () => {
  const states = {
    loading: 'Loading daily sales',
    'no-data': 'No sales recorded this month',
    'permission-denied': 'Sales data is unavailable',
    error: 'Daily sales could not be loaded'
  } as const;

  for (const state of Object.keys(states) as (keyof typeof states)[]) {
    const markup = renderToStaticMarkup(
      <OwnerSalesPerformance trend={[]} state={state} currency="MYR" locale="en-MY" />
    );
    assert.match(markup, new RegExp(`role="status"[^>]*>${states[state]}`));
    assert.doesNotMatch(markup, /<table|MYR 0\.00|Sales Records/);
  }
});

test('operations preserve native invoice navigation and distinguish zero from unavailable data', () => {
  const cards: OwnerMetricCard[] = [
    { label: 'Pending OCR', value: '0', icon: null, helper: 'None waiting', tone: 'primary', state: 'ready' },
    { label: 'Pending Invoices', value: '0', icon: null, helper: 'None waiting', tone: 'primary', state: 'permission-denied', onClick: () => {} }
  ];
  const markup = renderToStaticMarkup(<OwnerMetricSection title="Daily Operations" cards={cards} layout="rows" />);
  assert.match(markup, /Pending OCR.*>0</);
  assert.match(markup, /<button[^>]+>.*Pending Invoices.*Access unavailable.*<\/button>/);
});

test('Business Home opts into the inline task form and Chef Home keeps the existing default', () => {
  const home = readFileSync(new URL('../HomeTab.tsx', import.meta.url), 'utf8');
  const chef = readFileSync(new URL('./ChefHome.tsx', import.meta.url), 'utf8');
  const tasks = readFileSync(new URL('./TodaysTasks.tsx', import.meta.url), 'utf8');
  assert.match(home, /<TodaysTasks[^>]+ inline \/>/);
  assert.doesNotMatch(chef, /<TodaysTasks[^>]+ inline/);
  assert.match(tasks, /aria-expanded=\{isDialogOpen\}[\s\S]*aria-controls=\{inlineFormId\}[\s\S]*<div id=\{inlineFormId\} hidden=\{!isDialogOpen\}/);
  assert.match(tasks, /!inline && isDialogOpen/);
});
