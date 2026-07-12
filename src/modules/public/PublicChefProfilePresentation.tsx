import type { Key } from 'react';
import { Clock3, Copy, MapPin, MessageCircle, UserRound, Utensils } from 'lucide-react';
import type { Recipe } from '../../types';
import type { Portfolio, PortfolioExperience, PortfolioGalleryItem, PortfolioProfileSource, PortfolioSkill } from '../portfolio/types';
import { toPublicSlug } from './publicRoutes';

const meaningful = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && !['undefined', 'null', 'user log'].includes(trimmed.toLowerCase()) ? trimmed : '';
};

export function PublicProfileHero({ profile, portfolio, recipeCount }: { profile: PortfolioProfileSource; portfolio: Portfolio; recipeCount: number }) {
  const cover = meaningful(portfolio.hero?.backgroundImageUrl) || meaningful(portfolio.basicProfile.coverPhotoUrl);
  const name = meaningful(profile.displayName) || 'MiseChef Chef';
  const title = meaningful(portfolio.basicProfile.professionalTitle);
  const location = meaningful(portfolio.basicProfile.location);
  const introduction = meaningful(portfolio.basicProfile.shortBio);
  const avatar = meaningful(profile.avatarUrl);

  return <section className="mb-16 overflow-hidden rounded-3xl border border-surface-container-high bg-surface-container-low shadow-sm">
    <div className="relative h-48 bg-primary sm:h-64">
      {cover && <img src={cover} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
      <div className="absolute inset-0 bg-primary/25" />
    </div>
    <div className="relative px-6 pb-8 sm:px-10 sm:pb-10">
      <div className="-mt-14 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-surface-container-low bg-surface-container text-primary shadow-sm sm:h-32 sm:w-32">
        {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-12 w-12" />}
      </div>
      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">{name}</h1>
          {title && <p className="mt-2 font-sans text-sm font-extrabold uppercase tracking-[0.13em] text-secondary">{title}</p>}
          {location && <p className="mt-3 flex items-center gap-2 font-sans text-sm font-bold text-on-surface-variant"><MapPin className="h-4 w-4" />{location}</p>}
          {introduction && <p className="mt-5 max-w-2xl font-sans text-base font-bold leading-relaxed text-on-surface-variant">{introduction}</p>}
          <p className="mt-5 font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-outline">{recipeCount} public recipe{recipeCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="#contact-chef" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary"><MessageCircle className="h-4 w-4" />Contact Chef</a>
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-5 py-3 font-sans text-sm font-extrabold text-primary"><Copy className="h-4 w-4" />Copy Profile Link</button>
        </div>
      </div>
    </div>
  </section>;
}

export function PublicExperienceSection({ experiences }: { experiences: PortfolioExperience[] }) {
  const items = experiences.filter(item => item.visibility === 'public' && meaningful(item.role)).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!items.length) return null;
  return <section className="mb-16"><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Experience</p><h2 className="mt-1 font-display text-3xl font-bold text-primary">Professional Experience</h2><div className="mt-6 space-y-4 border-l border-surface-container-high pl-5 sm:pl-7">{items.map(item => <article key={item.id} className="relative rounded-2xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm"><span className="absolute -left-[1.65rem] top-7 h-3 w-3 rounded-full bg-secondary sm:-left-[2.15rem]" /><h3 className="font-display text-2xl font-bold text-primary">{item.role}</h3>{meaningful(item.organization) && <p className="mt-1 font-sans text-sm font-extrabold text-on-surface-variant">{item.organization}</p>}<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-sans text-xs font-bold text-outline">{meaningful(item.location) && <span>{item.location}</span>}{(meaningful(item.startDate) || meaningful(item.endDate) || item.isCurrent) && <span>{[item.startDate, item.isCurrent ? 'Current' : item.endDate].filter(Boolean).join(' – ')}</span>}</div>{meaningful(item.description) && <p className="mt-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{item.description}</p>}</article>)}</div></section>;
}

export function PublicSkillsSection({ skills }: { skills: PortfolioSkill[] }) {
  const items = skills.filter(item => item.visibility === 'public' && meaningful(item.name)).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!items.length) return null;
  return <section className="mb-16"><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Skills</p><h2 className="mt-1 font-display text-3xl font-bold text-primary">Culinary Skills</h2><div className="mt-5 flex flex-wrap gap-2">{items.map(item => <span key={item.id} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-2 font-sans text-sm font-extrabold text-primary">{item.name}</span>)}</div></section>;
}

export function PublicGallerySection({ items }: { items: PortfolioGalleryItem[] }) {
  const images = items.filter(item => item.visibility === 'public' && meaningful(item.imageUrl)).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!images.length) return null;
  return <section className="mb-16"><p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Gallery</p><h2 className="mt-1 font-display text-3xl font-bold text-primary">Culinary Gallery</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{images.map(item => <figure key={item.id} className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-low shadow-sm"><img src={item.imageUrl} alt={meaningful(item.title) || 'Chef gallery'} className="aspect-[4/3] w-full object-cover" referrerPolicy="no-referrer" />{meaningful(item.title) && <figcaption className="p-4 font-display text-lg font-bold text-primary">{item.title}</figcaption>}</figure>)}</div></section>;
}

export function PublicProfileRecipeCard({ recipe }: { recipe: Recipe; key?: Key }) {
  const prep = recipe.prepTime > 0 ? `${recipe.prepTime} min prep` : '';
  const cook = recipe.cookTime && recipe.cookTime > 0 ? `${recipe.cookTime} min cook` : '';
  const description = meaningful(recipe.story);
  return <a href={`/recipes/${toPublicSlug(recipe.title) || recipe.id}`} className="group overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-sm transition hover:shadow-md">{meaningful(recipe.coverImage) ? <img src={recipe.coverImage} alt={recipe.title} className="h-48 w-full object-cover" referrerPolicy="no-referrer" /> : <span className="flex h-48 items-center justify-center bg-surface-container-low text-primary"><Utensils className="h-7 w-7" /></span>}<div className="p-5"><h3 className="font-display text-2xl font-bold text-primary group-hover:text-secondary">{recipe.title}</h3>{description && <p className="mt-3 line-clamp-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{description}</p>}{(prep || cook) && <p className="mt-4 flex items-center gap-2 font-sans text-xs font-extrabold text-outline"><Clock3 className="h-4 w-4" />{[prep, cook].filter(Boolean).join(' · ')}</p>}</div></a>;
}
