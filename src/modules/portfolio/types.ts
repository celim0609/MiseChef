export type PortfolioVisibility = 'public' | 'private';
export type PortfolioPublishStatus = 'private' | 'draft' | 'published';

export interface PortfolioProfileSource {
  displayName: string;
  avatarUrl?: string;
  email?: string;
}

export interface PortfolioBasicProfile {
  professionalTitle?: string;
  yearsExperience?: string;
  shortBio?: string;
  quote?: string;
  coverPhotoUrl?: string;
  location?: string;
  specialties?: string[];
}

export interface PortfolioHero {
  backgroundImageUrl?: string;
}

export interface PortfolioAbout {
  title?: string;
  body?: string;
  quote?: string;
  highlights?: string[];
}

export interface PortfolioExperience {
  id: string;
  role: string;
  organization?: string;
  location?: string;
  employmentType?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
  visibility: PortfolioVisibility;
  sortOrder: number;
}

export interface PortfolioSkill {
  id: string;
  name: string;
  category?: string;
  level?: string;
  description?: string;
  visibility: PortfolioVisibility;
  sortOrder: number;
}

export interface PortfolioCertificate {
  id: string;
  title: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
  description?: string;
  skillsCertified?: string[];
  pdfFileName?: string;
  pdfUrl?: string;
  thumbnailFileName?: string;
  thumbnailUrl?: string;
  visibility: PortfolioVisibility;
  showPublicly: boolean;
  sortOrder: number;
}

export interface PortfolioGalleryItem {
  id: string;
  source: 'upload' | 'recipe';
  imageUrl?: string;
  imageFileName?: string;
  title: string;
  description?: string;
  tags?: string[];
  linkedRecipeId?: string;
  linkedRecipeTitle?: string;
  visibility: PortfolioVisibility;
  sortOrder: number;
}

export interface PortfolioFeaturedRecipe {
  recipeId: string;
  sortOrder: number;
  visibility: PortfolioVisibility;
}

export interface PortfolioResume {
  displayName?: string;
  fileName?: string;
  fileUrl?: string;
  visibility: PortfolioVisibility;
  allowDownload: boolean;
}

export interface PortfolioContact {
  email?: string;
  phone?: string;
  location?: string;
  message?: string;
  showEmail: boolean;
  showPhone: boolean;
}

export interface PortfolioMetadata {
  createdAt?: string;
  updatedAt?: string;
}

export interface PortfolioPublishingVisibility {
  status: PortfolioPublishStatus;
}

export interface PortfolioPublicProfile {
  enabled: boolean;
  username: string;
  ownerId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Portfolio {
  basicProfile: PortfolioBasicProfile;
  hero?: PortfolioHero;
  about?: PortfolioAbout;
  experience?: PortfolioExperience[];
  skills?: PortfolioSkill[];
  certificates?: PortfolioCertificate[];
  gallery?: PortfolioGalleryItem[];
  featuredRecipes?: PortfolioFeaturedRecipe[];
  resume?: PortfolioResume;
  contact?: PortfolioContact;
  metadata?: PortfolioMetadata;
  visibility?: PortfolioPublishingVisibility;
  publicProfile?: PortfolioPublicProfile;
}
