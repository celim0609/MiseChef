import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import StoreNotificationBell from './StoreNotificationBell';
import type { StoreNotification } from '../modules/store';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const bellSource = readFileSync(new URL('./StoreNotificationBell.tsx', import.meta.url), 'utf8');
const rulesSource = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const notification = (id: string, readAt = ''): StoreNotification => ({
  id,
  workspaceId: 'workspace-a',
  storeId: 'store-a',
  orderId: `order-${id}`,
  orderNumber: `MC-${id}`,
  type: 'new_order',
  title: 'New order',
  message: 'A new order is ready to prepare.',
  readAt,
  createdAt: '2026-08-03T12:00:00.000Z'
});

test('the application header bell renders the persistent unread count', () => {
  const markup = renderToStaticMarkup(
    <StoreNotificationBell
      notifications={[notification('1'), notification('2'), notification('3', '2026-08-03T12:05:00.000Z')]}
      onSelect={() => undefined}
    />
  );
  assert.match(markup, /2 unread Store notifications/);
  assert.match(markup, />2<\/span>/);
});

test('notification selection marks the document read and routes to the related Store order', () => {
  assert.match(appSource, /storeOrderService\.subscribeNotifications/);
  assert.match(appSource, /storeOrderService\.markNotificationRead\(selectedNotification\.id\)/);
  assert.match(appSource, /setFocusedStoreOrderId\(selectedNotification\.orderId\)/);
  assert.match(appSource, /handleRootNavigate\('store'\)/);
  assert.match(bellSource, /onSelect\(notification\)/);
});

test('notifications remain server-created and only their read timestamp is client writable', () => {
  const start = rulesSource.indexOf('match /storeNotifications/{notificationId}');
  const rules = rulesSource.slice(start, rulesSource.indexOf('match /publicChefProfileOwnership', start));
  assert.match(rules, /allow read: if isWorkspaceOwnerOrManager/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['readAt'\]\)/);
  assert.match(rules, /allow create, delete: if false/);
});
