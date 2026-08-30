import { useEffect, useRef, useState } from 'react';
import { Building2, FileUp, PackagePlus, Plus, UtensilsCrossed } from 'lucide-react';
import type { QuickAddActionDefinition, QuickAddActionId } from '../navigation/quickAdd';

interface GlobalQuickAddProps {
  actions: QuickAddActionDefinition[];
  onSelect: (action: QuickAddActionId) => void;
}

const actionIcons = {
  invoice: FileUp,
  recipe: UtensilsCrossed,
  ingredient: PackagePlus,
  supplier: Building2
};

export default function GlobalQuickAdd({ actions, onSelect }: GlobalQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const firstDesktopActionRef = useRef<HTMLButtonElement | null>(null);
  const firstMobileActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    (isDesktop ? firstDesktopActionRef : firstMobileActionRef).current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (actions.length === 0) return null;

  const chooseAction = (action: QuickAddActionId) => {
    setIsOpen(false);
    onSelect(action);
  };

  const renderActionList = (firstActionRef: typeof firstDesktopActionRef) => actions.map((action, index) => {
    const Icon = actionIcons[action.id];
    return (
      <button
        key={action.id}
        ref={index === 0 ? firstActionRef : undefined}
        type="button"
        role="menuitem"
        onClick={() => chooseAction(action.id)}
        data-quick-add-action={action.id}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-sans text-sm font-extrabold text-primary">{action.label}</span>
          <span className="mt-0.5 block font-sans text-xs font-bold text-on-surface-variant">{action.subtitle}</span>
        </span>
      </button>
    );
  });

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[60]" data-testid="quick-add-overlay">
          <button
            type="button"
            aria-label="Close Quick Add"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/25 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
          />

          <section
            role="menu"
            aria-label="Quick Add"
            data-testid="quick-add-desktop-menu"
            className="absolute bottom-24 right-8 hidden w-[340px] rounded-3xl border border-surface-container-high bg-white p-3 shadow-2xl sm:block"
          >
            <div className="px-3 pb-2 pt-1">
              <p className="font-display text-xl font-bold text-primary">Quick Add</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Create something in this workspace.</p>
            </div>
            {renderActionList(firstDesktopActionRef)}
          </section>

          <section
            role="menu"
            aria-label="Quick Add"
            data-testid="quick-add-mobile-sheet"
            className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border-t border-surface-container-high bg-white px-4 pb-24 pt-5 shadow-2xl sm:hidden"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-container-high" />
            <div className="px-2 pb-2">
              <p className="font-display text-xl font-bold text-primary">Quick Add</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Create something in this workspace.</p>
            </div>
            {renderActionList(firstMobileActionRef)}
          </section>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        id="global-quick-add-fab"
        aria-label={isOpen ? 'Close Quick Add' : 'Open Quick Add'}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="fixed bottom-24 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/25 outline-none transition-all hover:scale-105 hover:bg-primary-container focus:ring-4 focus:ring-primary/20 active:scale-95 md:bottom-8 md:right-8"
        title={isOpen ? 'Close Quick Add' : 'Quick Add'}
      >
        <Plus className={`h-7 w-7 text-white transition-transform ${isOpen ? 'rotate-45' : ''}`} />
      </button>
    </>
  );
}
