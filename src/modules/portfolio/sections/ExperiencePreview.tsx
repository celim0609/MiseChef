import type { PortfolioExperience } from '../types';

interface ExperiencePreviewProps {
  experiences: PortfolioExperience[];
}

const getPublicExperiences = (experiences: PortfolioExperience[]) => (
  experiences
    .filter(experience => experience.visibility === 'public')
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function ExperiencePreview({ experiences }: ExperiencePreviewProps) {
  const publicExperiences = getPublicExperiences(experiences);

  if (publicExperiences.length === 0) return null;

  return (
    <section className="animate-fade-in space-y-4 pb-10">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Experience
        </p>
        <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
          Professional Experience
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {publicExperiences.map(experience => (
          <article key={experience.id} className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 sm:p-6 shadow-sm space-y-3">
            <div>
              <h4 className="font-display text-2xl font-bold text-primary tracking-tight">
                {experience.role}
              </h4>
              {(experience.organization || experience.location || experience.employmentType) && (
                <p className="font-sans text-sm font-bold text-on-surface-variant mt-1">
                  {[experience.organization, experience.location, experience.employmentType].filter(Boolean).join(' | ')}
                </p>
              )}
              {(experience.startDate || experience.endDate || experience.isCurrent) && (
                <p className="font-sans text-xs font-extrabold text-outline mt-2">
                  {[experience.startDate, experience.isCurrent ? 'Current' : experience.endDate].filter(Boolean).join(' - ')}
                </p>
              )}
            </div>

            {experience.description && (
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                {experience.description}
              </p>
            )}

            {experience.achievements && experience.achievements.length > 0 && (
              <ul className="list-disc space-y-2 pl-5">
                {experience.achievements.map(achievement => (
                  <li key={achievement} className="font-sans text-sm font-bold text-on-surface-variant">
                    {achievement}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
