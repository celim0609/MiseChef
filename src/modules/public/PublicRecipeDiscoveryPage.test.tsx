import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendedProductsSection } from './PublicRecipeDiscoveryPage';

test('renders an optimized optional image without changing the safe product link', () => {
  const markup = renderToStaticMarkup(<RecommendedProductsSection
    recipeId="recipe_123"
    products={[{
      name: 'bread flour',
      url: 'https://s.shopee.sg/example',
      image: '/assets/products/redman-bread-flour-1kg.jpg'
    }]}
  />);

  assert.match(markup, /src="\/assets\/products\/redman-bread-flour-1kg\.jpg"/);
  assert.match(markup, /alt="bread flour product"/);
  assert.match(markup, /width="80"/);
  assert.match(markup, /height="80"/);
  assert.match(markup, /loading="lazy"/);
  assert.match(markup, /decoding="async"/);
  assert.match(markup, /href="\/go\/recipes\/recipe_123\/products\/0"/);
  assert.match(markup, /rel="noopener noreferrer sponsored"/);
  assert.doesNotMatch(markup, /href="https:\/\/s\.shopee\.sg/);
});

test('continues rendering products without images', () => {
  const markup = renderToStaticMarkup(<RecommendedProductsSection
    recipeId="recipe_123"
    products={[{ name: 'milk powder', url: 'https://s.shopee.sg/example' }]}
  />);

  assert.match(markup, />milk powder</);
  assert.match(markup, /href="\/go\/recipes\/recipe_123\/products\/0"/);
  assert.doesNotMatch(markup, /<img/);
});
