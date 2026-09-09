import { sanitizeChefSocialLinks } from '../chef-profile/socialLinks';

export const PublicChefSocialLinks = ({ socialLinks }: { socialLinks?: Record<string, string> }) => {
  const safeLinks = sanitizeChefSocialLinks(socialLinks);
  if (!Object.values(safeLinks).some(Boolean)) return null;
  return <section className="mb-16">
    <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Connect</p>
    <h2 className="font-display text-3xl font-bold text-primary">Social Links</h2>
    <div className="mt-5 flex flex-wrap gap-3">{Object.entries(safeLinks).map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-primary px-4 py-2 font-sans text-xs font-extrabold capitalize text-primary">{name}</a>)}</div>
  </section>;
};
