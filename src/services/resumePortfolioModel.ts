export type GeminiResumePortfolioDraft = {
  basicProfile?: {
    fullName?: string;
    professionalTitle?: string;
    yearsExperience?: string;
    shortBio?: string;
    quote?: string;
    location?: string;
    specialties?: string[];
  };
  about?: {
    title?: string;
    body?: string;
    quote?: string;
    highlights?: string[];
  };
  experience?: Array<{
    role?: string;
    organization?: string;
    location?: string;
    employmentType?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    achievements?: string[];
  }>;
  skills?: Array<{ name?: string; category?: string; level?: string; description?: string }>;
  certificates?: Array<{
    title?: string;
    issuer?: string;
    issueDate?: string;
    expiryDate?: string;
    credentialId?: string;
    credentialUrl?: string;
    description?: string;
    skillsCertified?: string[];
  }>;
  education?: Array<{ schoolName?: string; qualification?: string; fieldOfStudy?: string; startYear?: string; endYear?: string; description?: string }>;
  awards?: Array<{ name?: string; issuingOrganisation?: string; year?: string; description?: string }>;
  languages?: Array<{ language?: string; proficiency?: string }>;
  projects?: Array<{ title?: string; role?: string; description?: string; url?: string; startDate?: string; endDate?: string }>;
  unmappedSections?: Array<{ sectionName?: string; content?: string; reason?: string }>;
  socialLinks?: Record<string, string>;
  contact?: { email?: string; phone?: string; location?: string; message?: string };
};

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const readStringArray = (value: unknown) => Array.isArray(value)
  ? value.map(item => readString(item)).filter(Boolean)
  : [];

export const normalizeResumePortfolioDraft = (value: unknown): GeminiResumePortfolioDraft => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const basicProfile = source.basicProfile && typeof source.basicProfile === 'object' ? source.basicProfile as Record<string, unknown> : {};
  const about = source.about && typeof source.about === 'object' ? source.about as Record<string, unknown> : {};
  const contact = source.contact && typeof source.contact === 'object' ? source.contact as Record<string, unknown> : {};
  const experience = Array.isArray(source.experience) ? source.experience : [];
  const skills = Array.isArray(source.skills) ? source.skills : [];
  const certificates = Array.isArray(source.certificates) ? source.certificates : [];
  const education = Array.isArray(source.education) ? source.education : [];
  const awards = Array.isArray(source.awards) ? source.awards : [];
  const languages = Array.isArray(source.languages) ? source.languages : [];
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const unmappedSections = Array.isArray(source.unmappedSections) ? source.unmappedSections : [];
  const socialLinks = source.socialLinks && typeof source.socialLinks === 'object' ? source.socialLinks as Record<string, unknown> : {};

  return {
    basicProfile: {
      fullName: readString(basicProfile.fullName),
      professionalTitle: readString(basicProfile.professionalTitle || source.headline),
      yearsExperience: readString(basicProfile.yearsExperience),
      shortBio: readString(basicProfile.shortBio || source.summary),
      quote: readString(basicProfile.quote),
      location: readString(basicProfile.location),
      specialties: readStringArray(basicProfile.specialties)
    },
    about: {
      title: readString(about.title),
      body: readString(about.body),
      quote: readString(about.quote),
      highlights: readStringArray(about.highlights)
    },
    experience: experience.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        role: readString(entry.role),
        organization: readString(entry.organization),
        location: readString(entry.location),
        employmentType: readString(entry.employmentType),
        startDate: readString(entry.startDate),
        endDate: readString(entry.endDate),
        isCurrent: entry.isCurrent === true,
        description: readString(entry.description),
        achievements: readStringArray(entry.achievements)
      };
    }).filter(item => item.role || item.organization || item.description),
    skills: skills.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        name: readString(entry.name),
        category: readString(entry.category),
        level: readString(entry.level),
        description: readString(entry.description)
      };
    }).filter(item => item.name),
    certificates: certificates.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        title: readString(entry.title),
        issuer: readString(entry.issuer),
        issueDate: readString(entry.issueDate),
        expiryDate: readString(entry.expiryDate),
        credentialId: readString(entry.credentialId),
        credentialUrl: readString(entry.credentialUrl),
        description: readString(entry.description),
        skillsCertified: readStringArray(entry.skillsCertified)
      };
    }).filter(item => item.title),
    education: education.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        schoolName: readString(entry.schoolName || entry.institution || entry.school),
        qualification: readString(entry.qualification || entry.degree),
        fieldOfStudy: readString(entry.fieldOfStudy || entry.field),
        startYear: readString(entry.startYear),
        endYear: readString(entry.endYear || entry.graduationYear),
        description: readString(entry.description)
      };
    }).filter(item => item.schoolName || item.qualification || item.fieldOfStudy || item.description),
    awards: awards.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        name: readString(entry.name),
        issuingOrganisation: readString(entry.issuingOrganisation),
        year: readString(entry.year),
        description: readString(entry.description)
      };
    }).filter(item => item.name),
    languages: languages.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { language: readString(entry.language), proficiency: readString(entry.proficiency) };
    }).filter(item => item.language),
    projects: projects.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        title: readString(entry.title || entry.name),
        role: readString(entry.role),
        description: readString(entry.description),
        url: readString(entry.url || entry.link),
        startDate: readString(entry.startDate),
        endDate: readString(entry.endDate)
      };
    }).filter(item => item.title || item.description || item.url),
    unmappedSections: unmappedSections.map(item => {
      const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        sectionName: readString(entry.sectionName || entry.title),
        content: readString(entry.content),
        reason: readString(entry.reason)
      };
    }).filter(item => item.sectionName || item.content),
    socialLinks: Object.fromEntries(Object.entries(socialLinks)
      .map(([key, item]) => [key, readString(item)])
      .filter(([, item]) => Boolean(item))),
    contact: {
      email: readString(contact.email),
      phone: readString(contact.phone),
      location: readString(contact.location),
      message: readString(contact.message)
    }
  };
};
