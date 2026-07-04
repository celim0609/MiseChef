import type { PortfolioSkill } from '../types';

interface SkillsPreviewProps {
  skills: PortfolioSkill[];
}

const getPublicSkills = (skills: PortfolioSkill[]) => (
  skills
    .filter(skill => skill.visibility === 'public')
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function SkillsPreview({ skills }: SkillsPreviewProps) {
  const publicSkills = getPublicSkills(skills);

  if (publicSkills.length === 0) return null;

  return (
    <section className="animate-fade-in pb-10">
      <div className="space-y-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Skills
          </p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
            Culinary Skills
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {publicSkills.map(skill => (
            <article key={skill.id} className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {skill.category && (
                  <span className="rounded-full bg-white px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-secondary">
                    {skill.category}
                  </span>
                )}
                {skill.level && (
                  <span className="rounded-full bg-white px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                    {skill.level}
                  </span>
                )}
              </div>

              <h4 className="font-display text-2xl font-bold text-primary tracking-tight">
                {skill.name}
              </h4>

              {skill.description && (
                <p className="font-sans text-sm font-bold text-on-surface-variant">
                  {skill.description}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
