export type HomepagePromotionLinkType = 'internal' | 'external' | 'social';
export type HomepagePromotionSocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'other';

export interface HomepagePromotion {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  linkType: HomepagePromotionLinkType;
  socialPlatform?: HomepagePromotionSocialPlatform;
  imageUrl?: string;
  imagePath?: string;
  active: boolean;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  updatedBy?: string;
}

export const HOMEPAGE_PROMOTION_COLLECTION = 'homepagePromotions';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

export const inferHomepagePromotionLinkType = (value: unknown, href: string): HomepagePromotionLinkType => {
  if (value === 'internal' || value === 'external' || value === 'social') return value;
  return href.startsWith('/') && !href.startsWith('//') ? 'internal' : 'external';
};

export const normalizeHomepagePromotionHref = (value: string, linkType?: HomepagePromotionLinkType) => {
  const href = value.trim();
  const resolvedLinkType = linkType || inferHomepagePromotionLinkType(undefined, href);
  if (resolvedLinkType === 'internal') return href.startsWith('/') && !href.startsWith('//') ? href : '';
  try {
    const url = new URL(href);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export const mapHomepagePromotion = (id: string, value: Record<string, unknown>): HomepagePromotion => {
  const rawHref = readString(value.href);
  const linkType = inferHomepagePromotionLinkType(value.linkType, rawHref);
  const socialPlatform = value.socialPlatform;
  return {
    id,
    eyebrow: readString(value.eyebrow, 'MiseChef'),
    title: readString(value.title),
    description: readString(value.description),
    ctaLabel: readString(value.ctaLabel, 'Learn more'),
    href: normalizeHomepagePromotionHref(rawHref, linkType) || '/',
    linkType,
    ...(linkType === 'social' && ['instagram', 'tiktok', 'facebook', 'youtube', 'other'].includes(String(socialPlatform))
      ? { socialPlatform: socialPlatform as HomepagePromotionSocialPlatform }
      : {}),
    ...(readString(value.imageUrl) ? { imageUrl: readString(value.imageUrl) } : {}),
    ...(readString(value.imagePath) ? { imagePath: readString(value.imagePath) } : {}),
    active: value.active === true,
    sortOrder: Number.isInteger(value.sortOrder) ? Number(value.sortOrder) : 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    createdBy: readString(value.createdBy),
    updatedBy: readString(value.updatedBy)
  };
};

export const DEFAULT_HOMEPAGE_PROMOTIONS: HomepagePromotion[] = [
  {
    id: 'misechef-go',
    eyebrow: 'MiseChef Go',
    title: 'Your kitchen, wherever service takes you',
    description: 'Keep recipes and kitchen knowledge close at hand.',
    ctaLabel: 'Explore MiseChef',
    href: '/login',
    linkType: 'internal',
    active: true,
    sortOrder: 0
  },
  {
    id: 'sets',
    eyebrow: 'Sets & Combos',
    title: 'Build a menu made for sharing',
    description: 'Discover thoughtful bundles from MiseChef Stores.',
    ctaLabel: 'Discover Stores',
    href: '/recipes',
    linkType: 'internal',
    active: true,
    sortOrder: 1
  },
  {
    id: 'featured-store',
    eyebrow: 'Featured Store',
    title: 'Meet independent food makers',
    description: 'Order directly from chefs and culinary businesses.',
    ctaLabel: 'Explore',
    href: '/chefs',
    linkType: 'internal',
    active: true,
    sortOrder: 2
  },
  {
    id: 'share-and-earn',
    eyebrow: 'Share & Earn',
    title: 'Bring good food to your circle',
    description: 'Host a group order and share the experience together.',
    ctaLabel: 'Learn More',
    href: '/chefs',
    linkType: 'internal',
    active: true,
    sortOrder: 3
  }
];

export const sortActiveHomepagePromotions = (promotions: HomepagePromotion[]) => promotions
  .filter(promotion => promotion.active && promotion.title && promotion.href)
  .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

export interface HomepagePromotionCarouselItem {
  key: string;
  promotion: HomepagePromotion;
  isClone: boolean;
}

export const createLoopingHomepagePromotionItems = (promotions: HomepagePromotion[]): HomepagePromotionCarouselItem[] => {
  const originals = promotions.map(promotion => ({ key: promotion.id, promotion, isClone: false }));
  if (promotions.length < 2) return originals;
  return [...originals, ...promotions.map(promotion => ({
    key: `${promotion.id}-loop`,
    promotion,
    isClone: true
  }))];
};
