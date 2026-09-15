export const PRODUCT_SOCIAL_IMAGE = {
  width: 1200,
  height: 630,
  targetBytes: 300 * 1024,
  maxBytes: 600 * 1024
} as const;

export const getProductSocialImageCrop = (sourceWidth: number, sourceHeight: number) => {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = PRODUCT_SOCIAL_IMAGE.width / PRODUCT_SOCIAL_IMAGE.height;
  if (sourceRatio > targetRatio) {
    const width = Math.round(sourceHeight * targetRatio);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }
  const height = Math.round(sourceWidth / targetRatio);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
};
