const PROMOTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PROMOTION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const validateHomepagePromotionImageFile = (file: Pick<File, 'type' | 'size'>) => {
  if (!PROMOTION_IMAGE_TYPES.includes(file.type)) throw new Error('Promotion image must be a JPG, PNG, or WEBP file.');
  if (!file.size || file.size > PROMOTION_IMAGE_MAX_BYTES) throw new Error('Promotion image must be 10 MB or smaller.');
};
