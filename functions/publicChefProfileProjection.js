const readString = value => typeof value === 'string' ? value.trim() : '';

const readStringArray = value => Array.isArray(value)
  ? value.map(readString).filter(Boolean)
  : [];

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

export const normalizePublicUsername = value => readString(value).toLowerCase();

export const buildPublicChefProfileProjection = source => {
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
