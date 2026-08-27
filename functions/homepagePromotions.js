const readString = (value, maximumLength) => (
  typeof value === 'string' ? value.trim().slice(0, maximumLength) : ''
);

const isSafeHref = value => {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const toPublicHomepagePromotion = (id, value = {}) => {
  const title = readString(value.title, 160);
  const href = readString(value.href, 2048);
  if (!id || value.active !== true || !title || !isSafeHref(href)) return null;

  const imageUrl = readString(value.imageUrl, 2048);
  return {
    id,
    eyebrow: readString(value.eyebrow, 80) || 'MiseChef',
    title,
    description: readString(value.description, 320),
    ctaLabel: readString(value.ctaLabel, 80) || 'Learn more',
    href,
    ...(imageUrl && isSafeHref(imageUrl) && !imageUrl.startsWith('/') ? { imageUrl } : {}),
    active: true,
    sortOrder: Number.isInteger(value.sortOrder) ? Math.max(0, value.sortOrder) : 0
  };
};

export const loadPublicHomepagePromotions = async ({ loadPromotions }) => {
  const promotions = await loadPromotions();
  return promotions
    .map(item => toPublicHomepagePromotion(item.id, item))
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .slice(0, 20);
};
