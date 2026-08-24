import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import {
  DISCOVER_AUTOPLAY_MS,
  DISCOVER_TRANSITION_MS,
  getDiscoverDisplayLabel,
  getDiscoverSwipeDirection,
  getNextDiscoverIndex,
  getPreviousDiscoverIndex,
  shouldAutoPlayDiscover,
  type DiscoverItem
} from './discoverModel';

interface DiscoverCarouselProps {
  items: DiscoverItem[];
  ariaLabel?: string;
  onActivate?: (item: DiscoverItem) => void;
  onImpression?: (item: DiscoverItem) => void;
  onClick?: (item: DiscoverItem) => void;
}

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
};

export default function DiscoverCarousel({
  items,
  ariaLabel = 'Discover featured MiseChef content',
  onActivate,
  onImpression,
  onClick
}: DiscoverCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isPointerActive, setIsPointerActive] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isInteracting = isHovering || hasFocusWithin || isPointerActive;

  useEffect(() => {
    setActiveIndex(current => Math.min(current, Math.max(0, items.length - 1)));
    setPreviousIndex(null);
    setIsTransitioning(false);
  }, [items.length]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const moveTo = useCallback((nextIndex: number, nextDirection: 1 | -1) => {
    if (items.length < 2 || nextIndex === activeIndex || isTransitioning) return;
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    setDirection(nextDirection);
    setPreviousIndex(prefersReducedMotion ? null : activeIndex);
    setActiveIndex(nextIndex);

    if (!prefersReducedMotion) {
      setIsTransitioning(true);
      transitionTimer.current = window.setTimeout(() => {
        setPreviousIndex(null);
        setIsTransitioning(false);
      }, DISCOVER_TRANSITION_MS);
    }
  }, [activeIndex, isTransitioning, items.length, prefersReducedMotion]);

  const moveNext = useCallback(() => {
    moveTo(getNextDiscoverIndex(activeIndex, items.length), 1);
  }, [activeIndex, items.length, moveTo]);

  const movePrevious = useCallback(() => {
    moveTo(getPreviousDiscoverIndex(activeIndex, items.length), -1);
  }, [activeIndex, items.length, moveTo]);

  useEffect(() => {
    if (!shouldAutoPlayDiscover({ itemCount: items.length, prefersReducedMotion, isInteracting })) return;
    const timer = window.setTimeout(moveNext, DISCOVER_AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isInteracting, items.length, moveNext, prefersReducedMotion]);

  const activeItem = items[activeIndex];
  useEffect(() => {
    if (activeItem) onImpression?.(activeItem);
  }, [activeItem, onImpression]);

  if (!activeItem) return null;

  const activate = (item: DiscoverItem) => {
    onClick?.(item);
    onActivate?.(item);
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocusWithin(false);
  };

  const finishPointerGesture = (event: PointerEvent<HTMLElement>) => {
    const startX = pointerStartX.current;
    pointerStartX.current = null;
    setIsPointerActive(false);
    if (startX === null) return;
    const swipeDirection = getDiscoverSwipeDirection(startX, event.clientX);
    if (swipeDirection === 1) moveNext();
    if (swipeDirection === -1) movePrevious();
  };

  const renderSlide = (item: DiscoverItem, phase: 'active' | 'previous') => {
    const isPrevious = phase === 'previous';
    const animationClass = prefersReducedMotion
      ? ''
      : isPrevious
        ? direction === 1 ? 'discover-slide-exit-next' : 'discover-slide-exit-previous'
        : direction === 1 ? 'discover-slide-enter-next' : 'discover-slide-enter-previous';
    const displayLabel = getDiscoverDisplayLabel(item);

    return (
      <article
        key={`${phase}-${item.id}`}
        aria-hidden={isPrevious || undefined}
        className={`absolute inset-0 overflow-hidden rounded-3xl border border-surface-container-high bg-surface-container-low shadow-sm ${animationClass}`}
      >
        {item.imageUrl ? (
          <>
            <img
              src={item.imageUrl}
              alt={item.imageAlt || ''}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-y-0 right-0 hidden h-full w-[42%] object-cover sm:block"
            />
            <div className="absolute inset-0 hidden bg-gradient-to-r from-surface-container-low via-surface-container-low/95 to-surface-container-low/25 sm:right-[32%] sm:block" />
          </>
        ) : (
          <div className="absolute inset-y-0 right-0 hidden w-2/5 items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/15 sm:flex">
            <Sparkles className="h-20 w-20 text-secondary/35" aria-hidden="true" />
          </div>
        )}

        <div className="relative z-10 flex h-full max-w-full flex-col justify-center px-6 pb-12 pt-8 sm:max-w-[66%] sm:px-8 sm:pb-11">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">{displayLabel}</p>
          <h2 className="mt-2 line-clamp-2 font-display text-3xl font-bold leading-tight text-primary sm:text-4xl">{item.title}</h2>
          <p className="mt-2 line-clamp-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{item.description}</p>
          <div className="mt-4">
            {isPrevious ? (
              <span className="font-sans text-sm font-extrabold text-secondary">{item.ctaLabel} →</span>
            ) : item.destination.kind === 'href' ? (
              <a href={item.destination.href} onClick={() => onClick?.(item)} className="inline-flex rounded-full bg-primary px-5 py-2.5 font-sans text-sm font-extrabold text-on-primary transition-colors hover:bg-primary-container focus:outline-none focus:ring-4 focus:ring-primary/20">
                {item.ctaLabel} →
              </a>
            ) : (
              <button type="button" onClick={() => activate(item)} className="inline-flex rounded-full bg-primary px-5 py-2.5 font-sans text-sm font-extrabold text-on-primary transition-colors hover:bg-primary-container focus:outline-none focus:ring-4 focus:ring-primary/20">
                {item.ctaLabel} →
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <section
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={handleBlur}
      onPointerDown={event => {
        pointerStartX.current = event.clientX;
        setIsPointerActive(true);
      }}
      onPointerUp={finishPointerGesture}
      onPointerCancel={() => {
        pointerStartX.current = null;
        setIsPointerActive(false);
      }}
      className="relative h-[292px] touch-pan-y sm:h-[252px]"
    >
      <div className="absolute inset-0" aria-live="polite">
        {previousIndex !== null && items[previousIndex] ? renderSlide(items[previousIndex], 'previous') : null}
        {renderSlide(activeItem, 'active')}
      </div>

      {items.length > 1 && (
        <>
          <div className="absolute right-4 top-4 z-20 flex gap-2">
            <button type="button" onClick={movePrevious} aria-label="Previous Discover item" className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high bg-background/90 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-container focus:outline-none focus:ring-4 focus:ring-primary/20">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={moveNext} aria-label="Next Discover item" className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high bg-background/90 text-primary shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-container focus:outline-none focus:ring-4 focus:ring-primary/20">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2" aria-label="Choose Discover item">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => moveTo(index, index >= activeIndex ? 1 : -1)}
                aria-label={`Show Discover item ${index + 1} of ${items.length}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={`h-2 rounded-full transition-[width,background-color] duration-300 focus:outline-none focus:ring-2 focus:ring-primary/30 ${index === activeIndex ? 'w-7 bg-secondary' : 'w-2 bg-outline/45'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
