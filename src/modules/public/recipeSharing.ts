/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode, { type QRCodeToDataURLOptions } from 'qrcode';
import { createStoreQrBlob, STORE_QR_OPTIONS } from '../store/customerEntry';

type RecipeQrGenerator = (
  publicRecipeUrl: string,
  options: QRCodeToDataURLOptions
) => Promise<string>;

const generateQrDataUrl: RecipeQrGenerator = (publicRecipeUrl, options) => (
  QRCode.toDataURL(publicRecipeUrl, options)
);

const safeFileToken = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const getPublicRecipePath = (recipeId: string) => (
  `/recipes/${encodeURIComponent(recipeId.trim())}`
);

export const getPublicRecipeUrl = (origin: string, recipeId: string) => (
  new URL(getPublicRecipePath(recipeId), origin).toString()
);

export const getRecipeShareData = (
  origin: string,
  recipe: { id: string; title: string }
) => ({
  title: recipe.title.trim() || 'MiseChef Recipe',
  text: `View ${recipe.title.trim() || 'this recipe'} on MiseChef.`,
  url: getPublicRecipeUrl(origin, recipe.id)
});

export const getRecipeQrFileName = (recipe: { id: string; title: string }) => {
  const token = safeFileToken(recipe.title) || safeFileToken(recipe.id) || 'misechef-recipe';
  return `${token}-recipe-qr.png`;
};

export const createRecipeQrDataUrl = (
  publicRecipeUrl: string,
  generate: RecipeQrGenerator = generateQrDataUrl
) => generate(publicRecipeUrl, STORE_QR_OPTIONS);

export const createRecipeQrBlob = createStoreQrBlob;

