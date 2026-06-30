export type PortfolioVisibility = 'public' | 'private';

export interface PortfolioBasicProfile {
  displayName?: string;
  professionalTitle?: string;
  shortBio?: string;
  location?: string;
  profilePhotoUrl?: string;
  coverPhotoUrl?: string;
  yearsExperience?: string;
  specialties?: string[];
}

export interface PortfolioExperience {
  id: string;
  role: string;
  organization?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
  visibility: PortfolioVisibility;
  sortOrder: number;
}

export interface Portfolio {
  basicProfile: PortfolioBasicProfile;
  experience?: PortfolioExperience[];
}
