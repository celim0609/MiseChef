const readString = value => typeof value === 'string' ? value.trim() : '';

const readStringArray = value => Array.isArray(value)
  ? value.map(readString).filter(Boolean)
  : [];

const socialDomains = {
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be']
};

export const normalizePublicChefSocialUrl = (platform, value) => {
  const candidate = readString(value);
  if (!socialDomains[platform] || !candidate) return '';
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && socialDomains[platform].some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
};

const sanitizeSocialLinks = value => Object.fromEntries(Object.keys(socialDomains).flatMap(platform => {
  const url = normalizePublicChefSocialUrl(platform, value?.[platform]);
  return url ? [[platform, url]] : [];
}));

const sanitizeAbout = value => {
  if (!value || typeof value !== 'object') return null;
  const about = {
    title: readString(value.title),
    body: readString(value.body),
    quote: readString(value.quote),
    highlights: readStringArray(value.highlights)
  };
  return about.title || about.body || about.quote || about.highlights.length ? about : null;
};

const sanitizeExperience = value => Array.isArray(value)
  ? value
      .filter(item => item?.visibility === 'public' && readString(item.role))
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map(item => ({
        role: readString(item.role),
        organization: readString(item.organization),
        location: readString(item.location),
        startDate: readString(item.startDate),
        endDate: readString(item.endDate),
        isCurrent: item.isCurrent === true,
        description: readString(item.description)
      }))
  : [];

const sanitizeSkills = value => Array.isArray(value)
  ? value
      .filter(item => item?.visibility === 'public' && readString(item.name))
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map(item => readString(item.name))
  : [];

const sanitizeGallery = value => Array.isArray(value)
  ? value
      .filter(item => item?.visibility === 'public' && readString(item.imageUrl))
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map(item => ({ imageUrl: readString(item.imageUrl), title: readString(item.title) }))
  : [];

const sanitizePartnerSpotlight = value => ({
  enabled: value?.enabled === true,
  partners: readStringArray(value?.partners)
});

const sanitizeCanonicalEntries = (value, mapper) => Array.isArray(value)
  ? value.map(mapper).filter(Boolean)
  : [];

const buildCanonicalProjection = source => {
  const username = normalizePublicUsername(source.profileSlug);
  if (!username || source.visibility !== 'public') return null;
  const basic = source.basicInfo && typeof source.basicInfo === 'object' ? source.basicInfo : {};
  return {
    username,
    displayName: readString(basic.fullName),
    avatarUrl: readString(basic.profilePhotoUrl),
    coverImageUrl: readString(basic.coverPhotoUrl),
    professionalTitle: readString(basic.professionalTitle),
    location: [readString(basic.location), readString(basic.country)].filter(Boolean).join(', '),
    shortBio: readString(basic.summary),
    experience: sanitizeCanonicalEntries(source.experiences, item => {
      const role = readString(item?.jobTitle);
      if (!role) return null;
      return {
        role,
        organization: readString(item?.companyName),
        location: readString(item?.location),
        startDate: [readString(item?.startMonth), readString(item?.startYear)].filter(Boolean).join(' '),
        endDate: [readString(item?.endMonth), readString(item?.endYear)].filter(Boolean).join(' '),
        isCurrent: item?.currentlyWorking === true,
        description: readString(item?.description)
      };
    }),
    skills: readStringArray(source.skills),
    gallery: sanitizeCanonicalEntries(source.portfolio, item => {
      const imageUrl = readString(item?.imageUrl);
      return imageUrl ? { imageUrl, title: readString(item?.title) } : null;
    }),
    education: sanitizeCanonicalEntries(source.education, item => {
      const schoolName = readString(item?.schoolName);
      return schoolName ? {
        schoolName,
        qualification: readString(item?.qualification),
        fieldOfStudy: readString(item?.fieldOfStudy),
        startYear: readString(item?.startYear),
        endYear: readString(item?.endYear),
        description: readString(item?.description)
      } : null;
    }),
    certificates: sanitizeCanonicalEntries(source.certificates, item => {
      const name = readString(item?.name);
      return name && item?.showPublicly === true ? {
        name,
        issuingOrganisation: readString(item?.issuingOrganisation),
        issueDate: readString(item?.issueDate),
        expiryDate: readString(item?.expiryDate),
        credentialUrl: readString(item?.credentialUrl)
      } : null;
    }),
    awards: sanitizeCanonicalEntries(source.awards, item => {
      const name = readString(item?.name);
      return name ? {
        name,
        issuingOrganisation: readString(item?.issuingOrganisation),
        year: readString(item?.year),
        description: readString(item?.description)
      } : null;
    }),
    languages: sanitizeCanonicalEntries(source.languages, item => {
      const language = readString(item?.language);
      return language ? { language, proficiency: readString(item?.proficiency) } : null;
    }),
    socialLinks: sanitizeSocialLinks(source.socialLinks),
    partnerSpotlight: { enabled: false, partners: [] },
    publishedAt: source.createdAt?.toDate?.()?.toISOString?.() || readString(source.createdAt)
  };
};

export const normalizePublicUsername = value => readString(value).toLowerCase();

export const buildPublicChefProfileProjection = source => {
  if (source?.basicInfo) return buildCanonicalProjection(source);
  const username = normalizePublicUsername(source.publicProfile?.username);
  if (!username || source.publicProfile?.enabled !== true) return null;

  const projection = {
    username,
    displayName: readString(source.publicProfile.displayName),
    avatarUrl: readString(source.publicProfile.avatarUrl),
    coverImageUrl: readString(source.hero?.backgroundImageUrl || source.basicProfile?.coverPhotoUrl),
    professionalTitle: readString(source.basicProfile?.professionalTitle),
    location: readString(source.basicProfile?.location),
    shortBio: readString(source.basicProfile?.shortBio),
    about: sanitizeAbout(source.about),
    experience: sanitizeExperience(source.experience),
    skills: sanitizeSkills(source.skills),
    gallery: sanitizeGallery(source.gallery),
    partnerSpotlight: sanitizePartnerSpotlight(source.partnerSpotlight),
    publishedAt: readString(source.metadata?.createdAt)
  };

  if (!projection.about) delete projection.about;
  return projection;
};
