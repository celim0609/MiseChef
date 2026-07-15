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
  partnerSpotlight: PortfolioPartnerSpotlight;
  publishedAt: string;
}
