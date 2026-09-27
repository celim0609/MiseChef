const extensionByMimeType: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export const loadRecipePhotoForStoreProduct = async ({
  recipeId,
  photoUrl,
  fetchImage = fetch
}: {
  recipeId: string;
  photoUrl: string;
  fetchImage?: typeof fetch;
}): Promise<File> => {
  const response = await fetchImage(photoUrl);
  if (!response.ok) {
    throw new Error('Unable to load the Recipe photo. Please choose a Product photo.');
  }

  const image = await response.blob();
  if (image.size > 10 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 10 MB.');
  }
  const extension = extensionByMimeType[image.type.toLowerCase()];
  if (!extension) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  return new File([image], `recipe-${recipeId}.${extension}`, { type: image.type });
};
