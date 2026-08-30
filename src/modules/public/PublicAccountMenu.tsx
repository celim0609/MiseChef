import { useEffect, useRef, useState } from 'react';
import { BookOpen, BriefcaseBusiness, ChevronDown, LogOut, ReceiptText, UserRound, UsersRound } from 'lucide-react';
import type { PublicHostMenuAction } from './hostReturnNavigation';

export default function PublicAccountMenu({
  hostAction,
  onSignOut
}: {
  hostAction: PublicHostMenuAction | null;
  onSignOut: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstItemRef = useRef<HTMLAnchorElement | null>(null);
  const menuId = 'public-account-menu';

  useEffect(() => {
    if (!isOpen) return;

    const focusFrame = window.requestAnimationFrame(() => firstItemRef.current?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen(current => !current)}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 font-sans text-xs font-extrabold text-on-primary transition hover:bg-primary-container active:scale-95 sm:px-4"
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        Account
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="fixed inset-x-3 top-16 z-[90] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-3xl border border-surface-container-high bg-white p-2 shadow-2xl shadow-primary/15 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <a ref={firstItemRef} role="menuitem" href="/app/recipes" onClick={closeMenu} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-primary transition-colors hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/20">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <span className="font-sans text-sm font-extrabold">My Recipes</span>
          </a>

          <a role="menuitem" href="/orders" onClick={closeMenu} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-primary transition-colors hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/20">
            <ReceiptText className="h-5 w-5" aria-hidden="true" />
            <span className="font-sans text-sm font-extrabold">My Orders</span>
          </a>

          {hostAction && (
            <a role="menuitem" href={hostAction.href} onClick={closeMenu} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-primary transition-colors hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/20">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-sans text-sm font-extrabold">{hostAction.label}</span>
                <span className="block font-sans text-[11px] font-bold text-on-surface-variant">{hostAction.description}</span>
              </span>
            </a>
          )}

          <a role="menuitem" href="/app" onClick={closeMenu} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-primary transition-colors hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/20">
            <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-sans text-sm font-extrabold">Workspace</span>
              <span className="block font-sans text-[11px] font-bold text-on-surface-variant">Business tools</span>
            </span>
          </a>

          <div className="mt-1 border-t border-surface-container-high pt-1">
            <button type="button" role="menuitem" onClick={() => { closeMenu(); void onSignOut(); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-secondary transition-colors hover:bg-secondary/10 focus:bg-secondary/10 focus:outline-none focus:ring-2 focus:ring-secondary/20">
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span className="font-sans text-sm font-extrabold">Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
