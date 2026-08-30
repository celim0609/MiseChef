import type { ChefSocialLinks } from './types';

export const CHEF_SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'facebook', 'linkedin', 'youtube'] as const;
export type ChefSocialPlatform = typeof CHEF_SOCIAL_PLATFORMS[number];
export const CHEF_SOCIAL_LABELS: Record<ChefSocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube'
};

const PLATFORM_DOMAINS: Record<ChefSocialPlatform, string[]> = {
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be']
};

const matchesDomain = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);

export const normalizeChefSocialUrl = (platform: ChefSocialPlatform, value: unknown) => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !PLATFORM_DOMAINS[platform].some(domain => matchesDomain(parsed.hostname.toLowerCase(), domain))) return '';
    return parsed.toString();
  } catch {
    return '';
  }
};

export const getChefSocialLinkError = (platform: ChefSocialPlatform, value: unknown) => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || normalizeChefSocialUrl(platform, candidate)) return '';
  const domains = PLATFORM_DOMAINS[platform].join(' or ');
  return `${CHEF_SOCIAL_LABELS[platform]} must use an HTTPS ${domains} URL.`;
};

export const getChefSocialLinksValidationError = (links: ChefSocialLinks) => {
  for (const platform of CHEF_SOCIAL_PLATFORMS) {
    const error = getChefSocialLinkError(platform, links[platform]);
    if (error) return error;
  }
  return '';
};

export const sanitizeChefSocialLinks = (links: unknown): ChefSocialLinks => {
  const source = links && typeof links === 'object' ? links as Record<string, unknown> : {};
  return Object.fromEntries(CHEF_SOCIAL_PLATFORMS.flatMap(platform => {
    const url = normalizeChefSocialUrl(platform, source[platform]);
    return url ? [[platform, url]] : [];
  }));
};

export const preserveLegacyChefWebsiteLinks = (existing: unknown, safeLinks: ChefSocialLinks): ChefSocialLinks => {
  const source = existing && typeof existing === 'object' ? existing as Record<string, unknown> : {};
  const legacyLinks = Object.fromEntries(['website', 'personalWebsite'].flatMap(key => (
    typeof source[key] === 'string' && source[key]
      ? [[key, source[key]]]
      : []
  )));
  return { ...safeLinks, ...legacyLinks };
};
