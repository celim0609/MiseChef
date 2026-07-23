import { BookOpen, CheckCircle2, Circle, UserRound } from 'lucide-react';

interface FirstTimeHomeProps {
  greeting: string;
  onCreateRecipe?: () => void;
  onCompleteProfile?: () => void;
}

const checklistItems = [
  'Create your first recipe',
  'Explore public recipes',
  'Complete your chef profile'
];

export default function FirstTimeHome({
  greeting,
  onCreateRecipe,
  onCompleteProfile
}: FirstTimeHomeProps) {
  return (
    <div className="mx-auto w-full max-w-5xl animate-fade-in">
      <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8 lg:p-10">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Getting Started
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
            {greeting}
          </h1>
          <p className="mt-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant sm:text-base">
            Start with your first recipe. MiseChef will grow into your daily workspace as you add your kitchen information.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-6">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Progress Checklist</p>
            <div className="mt-5 space-y-3">
              {checklistItems.map(item => (
                <div key={item} className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3">
                  <Circle className="h-4 w-4 shrink-0 text-outline" />
                  <span className="font-sans text-sm font-extrabold text-primary">{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm sm:p-6">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Start Here</p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={onCreateRecipe}
                className="flex w-full items-center gap-4 rounded-2xl bg-primary p-4 text-left text-on-primary transition hover:opacity-95 active:scale-[0.99]"
              >
                <span className="rounded-full bg-white/15 p-3">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-sans text-sm font-extrabold">Create First Recipe</span>
                  <span className="mt-1 block font-sans text-xs font-bold text-on-primary/75">Add the first recipe to your workspace.</span>
                </span>
              </button>

              <a
                href="/recipes"
                className="flex w-full items-center gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-left transition hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
              >
                <span className="rounded-full bg-secondary/10 p-3 text-secondary">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-sans text-sm font-extrabold text-primary">Explore Public Recipes</span>
                  <span className="mt-1 block font-sans text-xs font-bold text-on-surface-variant">Discover recipes shared by MiseChef chefs.</span>
                </span>
              </a>

              <button
                type="button"
                onClick={onCompleteProfile}
                className="flex w-full items-center gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-left transition hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
              >
                <span className="rounded-full bg-primary/10 p-3 text-primary">
                  <UserRound className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-sans text-sm font-extrabold text-primary">Complete Profile</span>
                  <span className="mt-1 block font-sans text-xs font-bold text-on-surface-variant">Add your chef details and profile photo.</span>
                </span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
