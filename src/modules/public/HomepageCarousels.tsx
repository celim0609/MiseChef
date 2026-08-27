import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import type { HomepagePromotion } from './homepagePromotions';

const announcements = [
  { id: 'launch', message: 'A more beautiful MiseChef is arriving for every kitchen.', href: '/login', cta: 'Open MiseChef' },
  { id: 'discover', message: 'Discover original recipes and the chefs behind them.', href: '/recipes', cta: 'Explore recipes' },
  { id: 'stores', message: 'From chef-made Sets to group orders — food is better shared.', href: '/chefs', cta: 'Meet the makers' }
];

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
};

export function HomepageAnnouncementCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || isPaused || isInteracting) return;
    const timer = window.setTimeout(() => setActiveIndex(current => (current + 1) % announcements.length), 6_000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isInteracting, isPaused, reducedMotion]);

  const announcement = announcements[activeIndex];
  return (
    <section
      aria-label="MiseChef announcements"
      aria-roledescription="carousel"
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="homepage-announcement bg-[#203b2a] text-white"
    >
      <div className="mx-auto flex min-h-10 max-w-7xl items-center justify-center gap-3 px-4 py-2 text-center sm:px-6 lg:px-8">
        <button type="button" onClick={() => setActiveIndex(current => (current - 1 + announcements.length) % announcements.length)} aria-label="Previous announcement" className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <p key={announcement.id} className="homepage-announcement-copy flex-1 font-sans text-[11px] font-bold tracking-wide sm:text-xs">
          {announcement.message} <a href={announcement.href} className="ml-1 inline-flex items-center gap-1 font-extrabold text-[#f7a24b] underline-offset-4 hover:underline">{announcement.cta}<ArrowRight className="h-3 w-3" /></a>
        </p>
        <button type="button" onClick={() => setIsPaused(current => !current)} aria-label={isPaused ? 'Play announcements' : 'Pause announcements'} className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95">{isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={() => setActiveIndex(current => (current + 1) % announcements.length)} aria-label="Next announcement" className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </section>
  );
}

export function HomepagePromotionCarousel({ promotions }: { promotions: HomepagePromotion[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const reducedMotion = useReducedMotion();
  const cardCount = promotions.length;

  const move = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>('[data-promotion-card]');
    const distance = (card?.offsetWidth || rail.clientWidth * 0.8) + 16;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8;
    const atStart = rail.scrollLeft <= 8;
    rail.scrollTo({
      left: direction === 1 && atEnd ? 0 : direction === -1 && atStart ? rail.scrollWidth : rail.scrollLeft + direction * distance,
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
  };

  useEffect(() => {
    if (cardCount < 2 || reducedMotion || isPaused || isInteracting) return;
    const timer = window.setTimeout(() => move(1), 7_500);
    return () => window.clearTimeout(timer);
  });

  if (!promotions.length) return null;

  return (
    <section
      aria-labelledby="homepage-promotions-title"
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="homepage-section-enter"
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.22em] text-secondary">What’s happening</p>
          <h2 id="homepage-promotions-title" className="mt-1 font-display text-3xl font-bold text-primary sm:text-4xl">Made for the way food moves</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setIsPaused(current => !current)} aria-label={isPaused ? 'Play promotions' : 'Pause promotions'} className="homepage-circle-button">{isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          <button type="button" onClick={() => move(-1)} aria-label="Previous promotions" className="homepage-circle-button"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next promotions" className="homepage-circle-button"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={railRef} className="homepage-promotion-rail" aria-label="Homepage promotions">
        {promotions.map((promotion, index) => (
          <a key={promotion.id} data-promotion-card href={promotion.href} className="homepage-promotion-card group">
            <div className="relative h-32 overflow-hidden bg-gradient-to-br from-[#294b35] to-[#172b20]">
              {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <Sparkles className="absolute bottom-4 right-4 h-12 w-12 text-[#f7a24b]/45" aria-hidden="true" />}
              <span className="absolute left-4 top-4 rounded-full bg-[#fffaf0]/95 px-3 py-1 font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#203b2a] shadow-sm">{promotion.eyebrow}</span>
            </div>
            <div className="flex min-h-44 flex-col p-5">
              <h3 className="font-display text-2xl font-bold leading-tight text-primary">{promotion.title}</h3>
              <p className="mt-2 line-clamp-2 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{promotion.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 font-sans text-xs font-extrabold text-secondary">{promotion.ctaLabel}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
