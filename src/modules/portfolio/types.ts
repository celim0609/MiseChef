export type PortfolioVisibility = 'public' | 'private';

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
