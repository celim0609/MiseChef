import type { Portfolio, PortfolioProfileSource } from '../types';

interface HeroProps {
  profile: PortfolioProfileSource;
  portfolio: Portfolio;
}

export default function Hero({ profile, portfolio }: HeroProps) {
  const {
    professionalTitle,
    yearsExperience,
    shortBio,
    quote,
    coverPhotoUrl,
    location,
    specialties = []
  } = portfolio.basicProfile;
  const profileInitial = profile.displayName.trim().charAt(0).toUpperCase();
  const heroTitle = professionalTitle?.trim() || 'Complete your Portfolio';
  const heroBio = shortBio?.trim() || 'Add a short bio to introduce your culinary story, signature strengths, and current focus.';

  return (
    <section className="animate-fade-in pb-10">
      <div className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm overflow-hidden relative">
        {coverPhotoUrl && (
          <div className="absolute inset-0 opacity-20">
            <img
              src={coverPhotoUrl}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-surface-container-low/90" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden shrink-0">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : profileInitial ? (
              <span className="font-display text-3xl font-semibold">
                {profileInitial}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3">
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
              {heroTitle}
            </p>

            <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight">
              {profile.displayName}
            </h2>

            <p className="font-sans text-sm sm:text-base font-bold text-on-surface-variant max-w-2xl">
              {heroBio}
            </p>

            {quote && (
              <blockquote className="font-display italic text-lg text-primary">
                {quote}
              </blockquote>
            )}

            <div className="flex flex-wrap gap-2">
              {location && (
                <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">
                  {location}
                </span>
              )}
              {yearsExperience && (
                <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">
                  {yearsExperience}
                </span>
              )}
              {specialties.map(specialty => (
                <span
                  key={specialty}
                  className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary"
                >
                  {specialty}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
