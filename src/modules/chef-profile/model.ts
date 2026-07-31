import type { ChefProfile } from './types';
import type { Portfolio } from '../portfolio/types';

export const DEFAULT_SKILLS = [
  'Western Cuisine', 'Chinese Cuisine', 'Japanese Cuisine', 'Italian Cuisine',
  'French Cuisine', 'Bakery', 'Pastry', 'Butchery', 'Menu Development',
  'Food Costing', 'Kitchen Management', 'Food Safety', 'Food Styling', 'Recipe Development'
];

export const emptyChefProfile = (userId: string, fullName = '', email = ''): ChefProfile => ({
  userId,
  basicInfo: { fullName, professionalTitle: '', email },
  skills: [],
  experiences: [],
  education: [],
  certificates: [],
  awards: [],
  languages: [],
  socialLinks: {},
  portfolio: [],
  visibility: 'private',
  profileSlug: '',
  completionPercentage: 0
});

export const calculateCompletion = (profile: ChefProfile) => {
  const scores = [
    profile.basicInfo.profilePhotoUrl ? 10 : 0,
    profile.basicInfo.fullName.trim() && profile.basicInfo.professionalTitle.trim() ? 10 : 0,
    profile.basicInfo.summary?.trim() ? 10 : 0,
    profile.skills.length ? 10 : 0,
    profile.experiences.length ? 20 : 0,
    profile.education.length ? 10 : 0,
    profile.certificates.length ? 10 : 0,
    profile.languages.length ? 5 : 0,
    Object.values(profile.socialLinks).some(Boolean) ? 5 : 0,
    profile.portfolio.length ? 10 : 0
  ];
  return scores.reduce((sum, value) => sum + value, 0);
};

export const getNextAction = (profile: ChefProfile) => {
  if (!profile.basicInfo.profilePhotoUrl) return 'Add a profile photo';
  if (!profile.basicInfo.summary?.trim()) return 'Write your professional summary';
  if (!profile.skills.length) return 'Add your key skills';
  if (!profile.experiences.length) return 'Add work experience';
  if (!profile.education.length) return 'Add education';
  if (!profile.certificates.length) return 'Add a certificate';
  if (!profile.languages.length) return 'Add a language';
  if (!Object.values(profile.socialLinks).some(Boolean)) return 'Add a social link';
  if (!profile.portfolio.length) return 'Add portfolio work';
  return 'Your profile is ready to share';
};

export const slugifyProfile = (value: string) => value.trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const migratePortfolio = (userId: string, source: Portfolio, fallbackName = '', email = ''): ChefProfile => {
  const profile = emptyChefProfile(userId, source.publicProfile?.displayName || fallbackName, email);
  profile.basicInfo.professionalTitle = source.basicProfile?.professionalTitle || '';
  profile.basicInfo.profilePhotoUrl = source.publicProfile?.avatarUrl;
  profile.basicInfo.coverPhotoUrl = source.hero?.backgroundImageUrl || source.basicProfile?.coverPhotoUrl;
  profile.basicInfo.location = source.basicProfile?.location || source.contact?.location;
  profile.basicInfo.phone = source.contact?.phone;
  profile.basicInfo.email = source.contact?.email || email;
  profile.basicInfo.summary = source.basicProfile?.shortBio || source.about?.body;
  profile.skills = (source.skills || []).map(item => item.name).filter(Boolean);
  profile.experiences = (source.experience || []).map(item => ({
    id: item.id,
    jobTitle: item.role,
    companyName: item.organization || '',
    location: item.location,
    startYear: item.startDate,
    endYear: item.endDate,
    currentlyWorking: item.isCurrent === true,
    description: item.description
  }));
  profile.certificates = (source.certificates || []).map(item => ({
    id: item.id,
    name: item.title,
    issuingOrganisation: item.issuer,
    issueDate: item.issueDate,
    expiryDate: item.expiryDate,
    credentialUrl: item.credentialUrl,
    attachmentUrl: item.pdfUrl,
    showPublicly: item.showPublicly
  }));
  profile.portfolio = (source.gallery || []).map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    imageUrl: item.imageUrl
  }));
  profile.visibility = source.publicProfile?.enabled ? 'public' : 'private';
  profile.profileSlug = source.publicProfile?.username || slugifyProfile(profile.basicInfo.fullName);
  profile.completionPercentage = calculateCompletion(profile);
  return profile;
};

export const sanitizeProfile = (value: ChefProfile): ChefProfile => {
  const text = (input: unknown, max = 2000) => typeof input === 'string'
    ? input.replace(/[<>]/g, '').trim().slice(0, max)
    : '';
  const url = (input: unknown) => {
    const clean = text(input, 2048);
    if (!clean) return '';
    try {
      const parsed = new URL(clean);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? clean : '';
    } catch {
      return '';
    }
  };
  const profile: ChefProfile = {
    ...value,
    userId: text(value.userId, 128),
    basicInfo: {
      ...value.basicInfo,
      fullName: text(value.basicInfo.fullName, 120),
      professionalTitle: text(value.basicInfo.professionalTitle, 120),
      profilePhotoUrl: url(value.basicInfo.profilePhotoUrl),
      coverPhotoUrl: url(value.basicInfo.coverPhotoUrl),
      location: text(value.basicInfo.location, 160),
      country: text(value.basicInfo.country, 80),
      nationality: text(value.basicInfo.nationality, 80),
      phone: text(value.basicInfo.phone, 40),
      email: text(value.basicInfo.email, 200),
      summary: text(value.basicInfo.summary, 3000)
    },
    skills: value.skills.slice(0, 50).map(item => text(item, 80)).filter(Boolean),
    experiences: value.experiences.slice(0, 30).map(item => ({
      id: text(item.id, 128), jobTitle: text(item.jobTitle, 120), companyName: text(item.companyName, 160),
      location: text(item.location, 160), startMonth: text(item.startMonth, 20), startYear: text(item.startYear, 8),
      endMonth: text(item.endMonth, 20), endYear: text(item.endYear, 8), currentlyWorking: item.currentlyWorking === true,
      description: text(item.description, 3000)
    })).filter(item => item.jobTitle || item.companyName),
    education: value.education.slice(0, 20).map(item => ({
      id: text(item.id, 128), schoolName: text(item.schoolName, 160), qualification: text(item.qualification, 160),
      fieldOfStudy: text(item.fieldOfStudy, 160), startYear: text(item.startYear, 8), endYear: text(item.endYear, 8),
      description: text(item.description, 2000)
    })).filter(item => item.schoolName || item.qualification || item.fieldOfStudy || item.description),
    certificates: value.certificates.slice(0, 30).map(item => ({
      id: text(item.id, 128), name: text(item.name, 160), issuingOrganisation: text(item.issuingOrganisation, 160),
      issueDate: text(item.issueDate, 32), expiryDate: text(item.expiryDate, 32), credentialUrl: url(item.credentialUrl),
      attachmentUrl: url(item.attachmentUrl), showPublicly: item.showPublicly === true
    })).filter(item => item.name),
    awards: value.awards.slice(0, 30).map(item => ({
      id: text(item.id, 128), name: text(item.name, 160), issuingOrganisation: text(item.issuingOrganisation, 160),
      year: text(item.year, 8), description: text(item.description, 2000)
    })).filter(item => item.name),
    languages: value.languages.slice(0, 20).map(item => ({
      id: text(item.id, 128), language: text(item.language, 80), proficiency: text(item.proficiency, 40)
    })).filter(item => item.language),
    socialLinks: Object.fromEntries(Object.entries(value.socialLinks)
      .map(([key, item]) => [key, url(item)])
      .filter(([, item]) => Boolean(item))),
    portfolio: value.portfolio.slice(0, 30).map(item => ({
      id: text(item.id, 128), title: text(item.title, 160), description: text(item.description, 2000),
      projectUrl: url(item.projectUrl), imageUrl: url(item.imageUrl), videoUrl: url(item.videoUrl)
    })).filter(item => item.title || item.description || item.projectUrl || item.imageUrl || item.videoUrl),
    profileSlug: slugifyProfile(value.profileSlug || value.basicInfo.fullName)
  };
  profile.completionPercentage = calculateCompletion(profile);
  return profile;
};

/** Resolves profile state only from the canonical document keyed by the active UID. */
export const resolveOwnedChefProfile = (userId: string, value?: ChefProfile | null): ChefProfile => {
  if (!value) return emptyChefProfile(userId);
  if (value.userId !== userId) throw new Error('Chef Profile ownership mismatch.');
  return sanitizeProfile(value);
};
