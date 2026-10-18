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
  let response: Response;
  try {
    // Recipe images have year-long caching. A fresh Firebase URL prevents a
    // response cached without CORS headers from surviving a bucket policy repair.
    let source = photoUrl;
    if (photoUrl.startsWith('https://firebasestorage.googleapis.com/')) {
      const url = new URL(photoUrl);
      url.searchParams.set('recipePhotoTransfer', String(Date.now()));
      source = url.toString();
    }
    response = await fetchImage(source, { cache: 'no-store' });
  } catch {
    throw new Error('Unable to transfer the Recipe photo. Check your connection or choose a Product photo manually.');
  }
  if (!response.ok) {
    throw new Error('Unable to load the Recipe photo. Please choose a Product photo.');
  }

  let image: Blob;
  try {
    image = await response.blob();
  } catch {
    throw new Error('Unable to read the Recipe photo. Please choose a Product photo manually.');
  }
  if (image.size > 10 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 10 MB.');
  }
  const extension = extensionByMimeType[image.type.toLowerCase()];
  if (!extension) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  return new File([image], `recipe-${recipeId}.${extension}`, { type: image.type });
};
