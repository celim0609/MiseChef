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
