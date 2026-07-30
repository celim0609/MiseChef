import type { PortfolioAbout, PortfolioPartnerSpotlight } from '../portfolio/types';

export interface PublicChefExperience {
  role: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
}

export interface PublicChefGalleryItem {
  imageUrl: string;
  title: string;
}

export interface PublicChefProfile {
  username: string;
  displayName: string;
  avatarUrl: string;
  coverImageUrl: string;
  professionalTitle: string;
  location: string;
  shortBio: string;
  about?: PortfolioAbout;
  experience: PublicChefExperience[];
  skills: string[];
  gallery: PublicChefGalleryItem[];
  education?: Array<{
    schoolName: string;
    qualification: string;
    fieldOfStudy: string;
    startYear: string;
    endYear: string;
    description: string;
  }>;
  certificates?: Array<{
    name: string;
    issuingOrganisation: string;
    issueDate: string;
    expiryDate: string;
    credentialUrl: string;
  }>;
  awards?: Array<{
    name: string;
    issuingOrganisation: string;
    year: string;
    description: string;
  }>;
  languages?: Array<{ language: string; proficiency: string }>;
  socialLinks?: Record<string, string>;
  partnerSpotlight: PortfolioPartnerSpotlight;
  publishedAt: string;
}
