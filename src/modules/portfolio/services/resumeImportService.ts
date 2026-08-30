import { parseResumeToPortfolioWithAI, type GeminiResumePortfolioDraft } from '../../../services/gemini';
import { extractChefResumeText } from '../../chef-profile/services/resumeTextExtraction';
import type { Portfolio, PortfolioCertificate, PortfolioExperience, PortfolioSkill } from '../types';

export type ResumeImportSummary = {
  experiences: number;
  skills: number;
  certificates: number;
  about: boolean;
  basicProfile: boolean;
  contact: boolean;
};

const readString = (value?: string) => (typeof value === 'string' ? value.trim() : '');

const readStringArray = (value?: string[]) => Array.isArray(value)
  ? value.map(item => readString(item)).filter(Boolean)
  : [];

export const extractResumeText = extractChefResumeText;

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> => (
  Object.entries(value).reduce<Partial<T>>((acc, [key, item]) => {
    if (Array.isArray(item)) {
      if (item.length > 0) acc[key as keyof T] = item as T[keyof T];
      return acc;
    }

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) acc[key as keyof T] = trimmed as T[keyof T];
      return acc;
    }

    if (item !== undefined && item !== null) {
      acc[key as keyof T] = item as T[keyof T];
    }

    return acc;
  }, {})
);

const toImportedExperience = (item: NonNullable<GeminiResumePortfolioDraft['experience']>[number], index: number, offset: number): PortfolioExperience => ({
  id: `experience_import_${Date.now()}_${index}`,
  role: readString(item.role) || 'Imported Experience',
  organization: readString(item.organization),
  location: readString(item.location),
  employmentType: readString(item.employmentType),
  startDate: readString(item.startDate),
  endDate: readString(item.endDate),
  isCurrent: item.isCurrent === true,
  description: readString(item.description),
  achievements: readStringArray(item.achievements),
  visibility: 'public',
  sortOrder: offset + index
});

const toImportedSkill = (item: NonNullable<GeminiResumePortfolioDraft['skills']>[number], index: number, offset: number): PortfolioSkill => ({
  id: `skill_import_${Date.now()}_${index}`,
  name: readString(item.name) || 'Imported Skill',
  category: readString(item.category),
  level: readString(item.level),
  description: readString(item.description),
  visibility: 'public',
  sortOrder: offset + index
});

const toImportedCertificate = (item: NonNullable<GeminiResumePortfolioDraft['certificates']>[number], index: number, offset: number): PortfolioCertificate => ({
  id: `certificate_import_${Date.now()}_${index}`,
  title: readString(item.title) || 'Imported Certificate',
  issuer: readString(item.issuer),
  issueDate: readString(item.issueDate),
  expiryDate: readString(item.expiryDate),
  credentialId: readString(item.credentialId),
  credentialUrl: readString(item.credentialUrl),
  description: readString(item.description),
  skillsCertified: readStringArray(item.skillsCertified),
  visibility: 'public',
  showPublicly: true,
  sortOrder: offset + index
});

export const mergeResumeImportIntoPortfolio = (portfolio: Portfolio, imported: GeminiResumePortfolioDraft) => {
  const importedExperiences = (imported.experience || []).map((item, index) => toImportedExperience(item, index, portfolio.experience?.length || 0));
  const importedSkills = (imported.skills || []).map((item, index) => toImportedSkill(item, index, portfolio.skills?.length || 0));
  const importedCertificates = (imported.certificates || []).map((item, index) => toImportedCertificate(item, index, portfolio.certificates?.length || 0));
  const basicProfile = compactObject({
    professionalTitle: imported.basicProfile?.professionalTitle,
    yearsExperience: imported.basicProfile?.yearsExperience,
    shortBio: imported.basicProfile?.shortBio,
    quote: imported.basicProfile?.quote,
    location: imported.basicProfile?.location,
    specialties: readStringArray(imported.basicProfile?.specialties)
  });
  const about = compactObject({
    title: imported.about?.title,
    body: imported.about?.body,
    quote: imported.about?.quote,
    highlights: readStringArray(imported.about?.highlights)
  });
  const contact = compactObject({
    email: imported.contact?.email,
    phone: imported.contact?.phone,
    location: imported.contact?.location,
    message: imported.contact?.message
  });

  const nextPortfolio: Portfolio = {
    ...portfolio,
    basicProfile: {
      ...portfolio.basicProfile,
      ...basicProfile
    },
    about: {
      ...(portfolio.about || {}),
      ...about
    },
    experience: [
      ...(portfolio.experience || []),
      ...importedExperiences
    ],
    skills: [
      ...(portfolio.skills || []),
      ...importedSkills
    ],
    certificates: [
      ...(portfolio.certificates || []),
      ...importedCertificates
    ],
    contact: {
      ...(portfolio.contact || { showEmail: true, showPhone: false }),
      ...contact
    }
  };

  const summary: ResumeImportSummary = {
    experiences: importedExperiences.length,
    skills: importedSkills.length,
    certificates: importedCertificates.length,
    about: Object.keys(about).length > 0,
    basicProfile: Object.keys(basicProfile).length > 0,
    contact: Object.keys(contact).length > 0
  };

  return { portfolio: nextPortfolio, summary };
};

export const importResumeToPortfolioDraft = async (portfolio: Portfolio, file: File, workspaceId: string) => {
  const resumeText = await extractResumeText(file);
  if (resumeText.length < 80) {
    throw new Error('Could not find enough readable resume text to import.');
  }

  const imported = await parseResumeToPortfolioWithAI(resumeText.slice(0, 50_000), workspaceId);
  return mergeResumeImportIntoPortfolio(portfolio, imported);
};
