export type ChefProfileVisibility = 'private' | 'public';

export interface ChefBasicInfo {
  fullName: string;
  professionalTitle: string;
  profilePhotoUrl?: string;
  coverPhotoUrl?: string;
  location?: string;
  country?: string;
  nationality?: string;
  phone?: string;
  email?: string;
  summary?: string;
}

export interface ChefExperience {
  id: string;
  jobTitle: string;
  companyName: string;
  location?: string;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  currentlyWorking: boolean;
  description?: string;
}

export interface ChefEducation {
  id: string;
  schoolName: string;
  qualification?: string;
  fieldOfStudy?: string;
  startYear?: string;
  endYear?: string;
  description?: string;
}

export interface ChefCertificate {
  id: string;
  name: string;
  issuingOrganisation?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialUrl?: string;
  attachmentUrl?: string;
  showPublicly?: boolean;
}

export interface ChefAward {
  id: string;
  name: string;
  issuingOrganisation?: string;
  year?: string;
  description?: string;
}

export interface ChefLanguage {
  id: string;
  language: string;
  proficiency?: string;
}

export interface ChefPortfolioItem {
  id: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface ChefSocialLinks {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
  youtube?: string;
  website?: string;
}

export interface ChefProfile {
  userId: string;
  basicInfo: ChefBasicInfo;
  skills: string[];
  experiences: ChefExperience[];
  education: ChefEducation[];
  certificates: ChefCertificate[];
  awards: ChefAward[];
  languages: ChefLanguage[];
  socialLinks: ChefSocialLinks;
  portfolio: ChefPortfolioItem[];
  visibility: ChefProfileVisibility;
  profileSlug?: string;
  completionPercentage: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ImportedChefProfile = Omit<ChefProfile, 'userId' | 'visibility' | 'completionPercentage' | 'createdAt' | 'updatedAt'> & {
  summaryGeneratedByAi?: boolean;
};

export interface ResumeExportSettings {
  includeProfilePhoto: boolean;
  includeEmail: boolean;
  includePhone: boolean;
  includeLocation: boolean;
  includeCertificates: boolean;
  includeAwards: boolean;
  includePortfolioLink: boolean;
  includeMiseChefProfileLink: boolean;
}
