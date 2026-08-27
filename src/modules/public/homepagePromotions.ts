export interface HomepagePromotion {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  imageUrl?: string;
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

export const normalizeHomepagePromotionHref = (value: string) => {
  const href = value.trim();
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export const mapHomepagePromotion = (id: string, value: Record<string, unknown>): HomepagePromotion => ({
  id,
  eyebrow: readString(value.eyebrow, 'MiseChef'),
  title: readString(value.title),
  description: readString(value.description),
  ctaLabel: readString(value.ctaLabel, 'Learn more'),
  href: normalizeHomepagePromotionHref(readString(value.href)) || '/',
  ...(readString(value.imageUrl) ? { imageUrl: readString(value.imageUrl) } : {}),
  active: value.active === true,
  sortOrder: Number.isInteger(value.sortOrder) ? Number(value.sortOrder) : 0,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  createdBy: readString(value.createdBy),
  updatedBy: readString(value.updatedBy)
});

export const DEFAULT_HOMEPAGE_PROMOTIONS: HomepagePromotion[] = [
  {
    id: 'misechef-go',
    eyebrow: 'MiseChef Go',
    title: 'Your kitchen, wherever service takes you',
    description: 'Keep recipes and kitchen knowledge close at hand.',
    ctaLabel: 'Explore MiseChef',
    href: '/login',
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
    active: true,
    sortOrder: 3
  }
];

export const sortActiveHomepagePromotions = (promotions: HomepagePromotion[]) => promotions
  .filter(promotion => promotion.active && promotion.title && promotion.href)
  .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
