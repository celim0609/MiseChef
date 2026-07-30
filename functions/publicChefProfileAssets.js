import { createHash } from 'node:crypto';
import { deletePublicAssets, publishPublicAsset } from './publicRecipeAssets.js';

const readString = value => typeof value === 'string' ? value.trim() : '';
const hashValue = value => createHash('sha256').update(value).digest('hex');

export const getPublicChefAssetPrefix = sourcePath =>
  `public-chef-assets/${hashValue(`chef:${sourcePath}`).slice(0, 32)}`;

export const publishPublicChefProfileAssets = async ({ sourcePath, profile }) => {
  const prefix = getPublicChefAssetPrefix(sourcePath);
  const internalIdentifiers = [
    profile.publicProfile?.ownerId,
    profile.userId,
    sourcePath.split('/')[1]
  ].map(readString).filter(Boolean);
  const assets = [];

  const avatar = await publishPublicAsset({
    sourceUrl: profile.publicProfile?.avatarUrl || profile.basicInfo?.profilePhotoUrl,
    destinationPath: `${prefix}/avatar`,
    internalIdentifiers
  });
  if (avatar.asset) assets.push(avatar.asset);

  const cover = await publishPublicAsset({
    sourceUrl: profile.hero?.backgroundImageUrl || profile.basicProfile?.coverPhotoUrl,
    destinationPath: `${prefix}/cover`,
    internalIdentifiers
  });
  if (cover.asset) assets.push(cover.asset);

  const sourceGallery = Array.isArray(profile.gallery) ? profile.gallery : (Array.isArray(profile.portfolio) ? profile.portfolio : []);
  const gallery = await Promise.all(sourceGallery.map(async (item, index) => {
    if (Array.isArray(profile.gallery) && item?.visibility !== 'public') return item;
    const image = await publishPublicAsset({
      sourceUrl: item.imageUrl,
      destinationPath: `${prefix}/gallery-${index + 1}`,
      internalIdentifiers
    });
    if (image.asset) assets.push(image.asset);
    return { ...item, imageUrl: image.url };
  }));

  return {
    profile: {
      ...profile,
      publicProfile: { ...profile.publicProfile, avatarUrl: avatar.url },
      basicInfo: { ...profile.basicInfo, profilePhotoUrl: avatar.url, coverPhotoUrl: cover.url },
      basicProfile: { ...profile.basicProfile, coverPhotoUrl: cover.url },
      hero: { ...profile.hero, backgroundImageUrl: cover.url },
      gallery: Array.isArray(profile.gallery) ? gallery : profile.gallery,
      portfolio: Array.isArray(profile.portfolio) ? gallery : profile.portfolio
    },
    assets
  };
};

export const deletePublicChefProfileAssets = deletePublicAssets;
