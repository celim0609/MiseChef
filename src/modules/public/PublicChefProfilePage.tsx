import { useEffect, useState, type FormEvent } from 'react';
import type { Portfolio, PortfolioProfileSource } from '../portfolio/types';
import Hero from '../portfolio/components/Hero';
import AboutPreview from '../portfolio/sections/AboutPreview';
import ExperiencePreview from '../portfolio/sections/ExperiencePreview';
import SkillsPreview from '../portfolio/sections/SkillsPreview';
import GalleryPreview from '../portfolio/sections/GalleryPreview';
import { PublicRecipeCard } from './PublicContent';
import { publicChefProfileService } from './services/publicChefProfileService';
import type { Recipe } from '../../types';

export default function PublicChefProfilePage({ username }: { username: string }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [formStatus, setFormStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    publicChefProfileService.getByUsername(username).then(result => {
      if (cancelled) return;
      if (!result) {
        setStatus('missing');
        return;
      }
      setPortfolio(result.portfolio);
      setRecipes(result.recipes);
      setStatus('ready');
    }).catch(() => !cancelled && setStatus('missing'));
    return () => { cancelled = true; };
  }, [username]);

  if (status === 'loading') return <div className="h-96 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading chef profile" />;
  if (!portfolio || status === 'missing' || !portfolio.publicProfile?.enabled) return <section className="rounded-3xl border border-dashed border-outline-variant p-12 text-center"><h1 className="font-display text-4xl font-bold text-primary">404</h1><p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Chef profile not found.</p></section>;

  const profile: PortfolioProfileSource = {
    displayName: portfolio.publicProfile.displayName,
    avatarUrl: portfolio.publicProfile.avatarUrl
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormStatus('Sending...');
    try {
      await publicChefProfileService.sendEnquiry({ profileOwnerId: portfolio.publicProfile!.ownerId, username: portfolio.publicProfile!.username, ...form });
      setForm({ name: '', email: '', message: '' });
      setFormStatus('Message sent.');
    } catch {
      setFormStatus('Message could not be sent.');
    }
  };

  return <div className="mx-auto max-w-6xl">
    <Hero profile={profile} portfolio={portfolio} />
    <AboutPreview about={portfolio.about} />
    <ExperiencePreview experiences={portfolio.experience || []} />
    <SkillsPreview skills={portfolio.skills || []} />
    <GalleryPreview items={portfolio.gallery || []} />
    <section className="pb-10">
      <h2 className="font-display text-3xl font-bold text-primary">Public Recipes</h2>
      {recipes.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recipes.map(recipe => <PublicRecipeCard key={recipe.id} recipe={recipe} />)}</div> : <p className="mt-4 rounded-2xl bg-surface-container-low p-6 font-sans text-sm font-bold text-on-surface-variant">No public recipes yet.</p>}
    </section>
    <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8">
      <h2 className="font-display text-3xl font-bold text-primary">Contact Chef</h2>
      <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Send a private enquiry without exposing personal contact details.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Your name" className="rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold outline-none" />
        <input required type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="Your email" className="rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold outline-none" />
        <textarea required value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} placeholder="Your message" rows={5} className="rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold outline-none sm:col-span-2" />
        <div className="flex items-center gap-4 sm:col-span-2"><button className="rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary">Contact Chef</button>{formStatus && <p className="font-sans text-xs font-bold text-on-surface-variant">{formStatus}</p>}</div>
      </form>
    </section>
  </div>;
}
