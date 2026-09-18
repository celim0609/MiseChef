/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode, { type QRCodeToDataURLOptions } from 'qrcode';

export const STORE_QR_SIZE = 1200;

export const STORE_QR_OPTIONS: QRCodeToDataURLOptions = {
  type: 'image/png',
  width: STORE_QR_SIZE,
  margin: 4,
  errorCorrectionLevel: 'M',
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
};

type StoreQrGenerator = (
  orderingUrl: string,
  options: QRCodeToDataURLOptions
) => Promise<string>;

const generateQrDataUrl: StoreQrGenerator = (orderingUrl, options) => (
  QRCode.toDataURL(orderingUrl, options)
);

export const getPublicOrderingPath = (slug: string) => (
  `/store/${encodeURIComponent(slug.trim())}`
);

export const getPublicOrderingUrl = (origin: string, slug: string) => (
  new URL(getPublicOrderingPath(slug), origin).toString()
);

export const getPublicProductPath = (storeSlug: string, productSlug: string) => (
  `${getPublicOrderingPath(storeSlug)}/product/${encodeURIComponent(productSlug.trim())}`
);

export const getPublicProductUrl = (origin: string, storeSlug: string, productSlug: string) => (
  new URL(getPublicProductPath(storeSlug, productSlug), origin).toString()
);

export const PUBLIC_PRODUCTION_ORIGIN = 'https://misechef.ai';

export const getPublicPromotionPath = (storeSlug: string, promotionId: string) => (
  `${getPublicOrderingPath(storeSlug)}/promotion/${encodeURIComponent(promotionId.trim())}`
);

export const getPublicPromotionUrl = (storeSlug: string, promotionId: string) => (
  new URL(getPublicPromotionPath(storeSlug, promotionId), PUBLIC_PRODUCTION_ORIGIN).toString()
);

export const getStoreProductShareData = (
  origin: string,
  store: { slug: string; name: string },
  product: { productSlug: string; name: string; description: string }
) => ({
  title: `${product.name.trim() || 'Product'} | ${store.name.trim() || 'MiseChef Store'}`,
  text: product.description.trim() || `Order ${product.name.trim() || 'this product'} from ${store.name.trim() || 'this MiseChef Store'}.`,
  url: getPublicProductUrl(origin, store.slug, product.productSlug)
});

export const getStoreShareData = (
  origin: string,
  store: { slug: string; name: string; description: string }
) => ({
  title: store.name.trim() || 'MiseChef Store',
  text: store.description.trim() || 'Browse this MiseChef Store and order ahead for pickup.',
  url: getPublicOrderingUrl(origin, store.slug)
});

export const getStorePromotionShareData = (
  store: { slug: string; name: string },
  promotion: { id: string; name: string; offer: string }
) => ({
  title: `${promotion.name.trim() || 'Store offer'} | ${store.name.trim() || 'MiseChef Store'}`,
  text: [promotion.offer.trim(), `from ${store.name.trim() || 'this MiseChef Store'}`].filter(Boolean).join(' · '),
  url: getPublicPromotionUrl(store.slug, promotion.id)
});

export const getStoreQrFileName = (slug: string) => (
  `${slug.trim() || 'misechef-store'}-order-qr.png`
);

export const createStoreQrDataUrl = (
  orderingUrl: string,
  generate: StoreQrGenerator = generateQrDataUrl
) => generate(orderingUrl, STORE_QR_OPTIONS);

export const createStoreQrBlob = (dataUrl: string): Blob => {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('The generated QR image could not be prepared for download.');
  const binary = atob(match[1]);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
};
