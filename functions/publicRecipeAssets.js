import { createHash, randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';

const PUBLIC_ASSET_ROOT = 'public-recipe-assets';
const SOURCE_HASH_METADATA_KEY = 'publicRecipeSourceHash';
const DOWNLOAD_TOKEN_METADATA_KEY = 'firebaseStorageDownloadTokens';

const readString = value => typeof value === 'string' ? value.trim() : '';
const hashValue = value => createHash('sha256').update(value).digest('hex');

export const getPublicRecipeAssetPrefix = recipeId =>
  `${PUBLIC_ASSET_ROOT}/${hashValue(`recipe:${recipeId}`).slice(0, 32)}`;

export const parseFirebaseStorageUrl = value => {
  const assetUrl = readString(value);
  if (!assetUrl) return null;

  try {
    const parsedUrl = new URL(assetUrl);
    if (parsedUrl.hostname === 'firebasestorage.googleapis.com') {
      const match = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      return {
        bucketName: decodeURIComponent(match[1]),
        objectPath: decodeURIComponent(match[2])
      };
    }

    if (parsedUrl.hostname === 'storage.googleapis.com') {
      const [, bucketName, ...objectParts] = parsedUrl.pathname.split('/');
      if (!bucketName || objectParts.length === 0) return null;
      return {
        bucketName: decodeURIComponent(bucketName),
        objectPath: decodeURIComponent(objectParts.join('/'))
      };
    }

    if (parsedUrl.hostname.endsWith('.storage.googleapis.com')) {
      return {
        bucketName: parsedUrl.hostname.slice(0, -'.storage.googleapis.com'.length),
        objectPath: decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''))
      };
    }
  } catch {
    return null;
  }

  return null;
};

const buildDownloadUrl = ({ bucketName, objectPath, token }) =>
  `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;

const readDownloadToken = metadata => readString(metadata?.metadata?.[DOWNLOAD_TOKEN_METADATA_KEY]).split(',')[0];

const copyPublicAsset = async ({ sourceUrl, destinationPath }) => {
  const source = parseFirebaseStorageUrl(sourceUrl);
  if (!source) return null;

  const bucket = getStorage().bucket(source.bucketName);
  const sourceFile = bucket.file(source.objectPath);
  const destinationFile = bucket.file(destinationPath);
  const sourceHash = hashValue(sourceUrl);
  const [destinationExists] = await destinationFile.exists();

  if (destinationExists) {
    const [metadata] = await destinationFile.getMetadata();
    const existingHash = readString(metadata?.metadata?.[SOURCE_HASH_METADATA_KEY]);
    const existingToken = readDownloadToken(metadata);
    if (existingHash === sourceHash && existingToken) {
      return {
        url: buildDownloadUrl({ bucketName: source.bucketName, objectPath: destinationPath, token: existingToken }),
        bucketName: source.bucketName,
        objectPath: destinationPath
      };
    }
  }

  await sourceFile.copy(destinationFile);
  const token = randomUUID();
  await destinationFile.setMetadata({
    cacheControl: 'public, max-age=3600',
    metadata: {
      [DOWNLOAD_TOKEN_METADATA_KEY]: token,
      [SOURCE_HASH_METADATA_KEY]: sourceHash
    }
  });

  return {
    url: buildDownloadUrl({ bucketName: source.bucketName, objectPath: destinationPath, token }),
    bucketName: source.bucketName,
    objectPath: destinationPath
  };
};

const getInternalIdentifiers = recipe => [
  recipe.workspaceId,
  recipe.companyId,
  recipe.userId,
  recipe.createdBy,
  recipe.ownerId
].map(readString).filter(Boolean);

const containsInternalIdentifier = (value, identifiers) =>
  identifiers.some(identifier => value.includes(identifier));

const publishAsset = async ({ sourceUrl, destinationPath, identifiers }) => {
  const normalizedUrl = readString(sourceUrl);
  if (!normalizedUrl) return { url: '', asset: null };

  const copiedAsset = await copyPublicAsset({ sourceUrl: normalizedUrl, destinationPath });
  if (copiedAsset) return { url: copiedAsset.url, asset: copiedAsset };

  return {
    url: containsInternalIdentifier(normalizedUrl, identifiers) ? '' : normalizedUrl,
    asset: null
  };
};

export const publishPublicRecipeAssets = async ({ recipeId, recipe }) => {
  const prefix = getPublicRecipeAssetPrefix(recipeId);
  const identifiers = getInternalIdentifiers(recipe);
  const assets = [];
  const cover = await publishAsset({
    sourceUrl: recipe.coverImage || recipe.imageUrl,
    destinationPath: `${prefix}/cover`,
    identifiers
  });
  if (cover.asset) assets.push(cover.asset);

  const method = await Promise.all((Array.isArray(recipe.method) ? recipe.method : []).map(async (step, index) => {
    const publicStepImage = await publishAsset({
      sourceUrl: step?.image,
      destinationPath: `${prefix}/step-${index + 1}`,
      identifiers
    });
    if (publicStepImage.asset) assets.push(publicStepImage.asset);
    return { ...step, image: publicStepImage.url };
  }));

  return {
    recipe: { ...recipe, coverImage: cover.url, imageUrl: cover.url, method },
    assets
  };
};

export const deletePublicRecipeAssets = async assets => {
  await Promise.all((Array.isArray(assets) ? assets : []).map(async asset => {
    const bucketName = readString(asset?.bucketName);
    const objectPath = readString(asset?.objectPath);
    if (!bucketName || !objectPath) return;
    await getStorage().bucket(bucketName).file(objectPath).delete({ ignoreNotFound: true });
  }));
};
