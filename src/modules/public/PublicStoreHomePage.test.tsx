import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PublicStoreHomePage from './PublicStoreHomePage';
import { resolvePublicRoute } from './publicRoutes';

describe('public Store Home', () => {
  it('resolves /store as the store index without changing store detail routes', () => {
    expect(resolvePublicRoute('/store')).toEqual({ page: 'stores' });
    expect(resolvePublicRoute('/store/gg-grab-go')).toEqual({ page: 'store', slug: 'gg-grab-go' });
  });

  it('renders an empty public store index safely', () => {
    const html = renderToStaticMarkup(<PublicStoreHomePage status="ready" stores={[]} />);
    expect(html).toContain('Find a Store');
    expect(html).toContain('No stores available yet');
  });
});
