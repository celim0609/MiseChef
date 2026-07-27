/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const getPublicOrderingPath = (slug: string) => (
  `/store/${encodeURIComponent(slug.trim())}`
);

export const getPublicOrderingUrl = (origin: string, slug: string) => (
  new URL(getPublicOrderingPath(slug), origin).toString()
);

export const getStoreQrFileName = (slug: string) => (
  `${slug.trim() || 'misechef-store'}-order-qr.png`
);
