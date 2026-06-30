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

export interface Portfolio {
  basicProfile: PortfolioBasicProfile;
}
