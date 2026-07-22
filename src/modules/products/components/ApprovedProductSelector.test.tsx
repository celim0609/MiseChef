import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovedProductSelector } from './ApprovedProductSelector';

test('renders legacy products before catalog selections without exposing affiliate URLs', () => {
  const markup = renderToStaticMarkup(
    <ApprovedProductSelector
      products={[
        { id: 'catalog_flour', name: 'Catalog Flour', imageUrl: '/flour.jpg', active: true },
        { id: 'catalog_yeast', name: 'Catalog Yeast', active: true }
      ]}
      selectedIds={['catalog_yeast', 'catalog_flour']}
      legacyProducts={[{ name: 'Legacy Product', url: 'https://s.shopee.sg/legacy' }]}
      isLoading={false}
      error=""
      onSelectedIdsChange={() => undefined}
      onRemoveLegacyProduct={() => undefined}
    />
  );

  assert.ok(markup.indexOf('Legacy Product') < markup.indexOf('Catalog Yeast'));
  assert.ok(markup.indexOf('Catalog Yeast') < markup.indexOf('Catalog Flour'));
  assert.doesNotMatch(markup, /s\.shopee\.sg/);
  assert.doesNotMatch(markup, /type="url"/);
  assert.doesNotMatch(markup, /<a /);
});

test('keeps inactive selected products removable and excludes them from available products', () => {
  const markup = renderToStaticMarkup(
    <ApprovedProductSelector
      products={[
        { id: 'inactive_product', name: 'Inactive Product', active: false },
        { id: 'active_product', name: 'Active Product', active: true }
      ]}
      selectedIds={['inactive_product']}
      legacyProducts={[]}
      isLoading={false}
      error=""
      onSelectedIdsChange={() => undefined}
      onRemoveLegacyProduct={() => undefined}
    />
  );

  assert.match(markup, /Inactive Product/);
  assert.match(markup, /Inactive — remove or keep for later/);
  assert.match(markup, /aria-label="Remove Inactive Product"/);
  assert.match(markup, /Active Product/);
});
