import { useState } from 'react';
import { BookOpen, Check, ChefHat, Store } from 'lucide-react';
import type { OnboardingGoal } from './onboardingModel';

interface IntentOnboardingProps {
  isSaving?: boolean;
  error?: string;
  onContinue: (goals: OnboardingGoal[]) => void;
  onSkip: () => void;
}

const choices: Array<{
  goal: OnboardingGoal;
  title: string;
  description: string;
  details: string[];
  icon: typeof ChefHat;
}> = [
  {
    goal: 'chef_profile',
    title: 'Build my Chef Profile',
    description: 'Showcase your work and culinary experience.',
    details: ['Portfolio', 'Resume', 'Culinary career'],
    icon: ChefHat
  },
  {
    goal: 'recipes',
    title: 'Create & Manage Recipes',
    description: 'Build a recipe library that stays organized.',
    details: ['Create', 'Import', 'Organize', 'Share recipes'],
    icon: BookOpen
  },
  {
    goal: 'sell_food',
    title: 'Sell Food',
    description: 'Set up a Store when you are ready to take orders.',
    details: ['Create a Store', 'Products', 'Orders', 'Payments'],
    icon: Store
  }
];

export default function IntentOnboarding({ isSaving = false, error = '', onContinue, onSkip }: IntentOnboardingProps) {
  const [selected, setSelected] = useState<OnboardingGoal[]>([]);

  const toggle = (goal: OnboardingGoal) => {
    setSelected(current => current.includes(goal)
      ? current.filter(item => item !== goal)
      : [...current, goal]);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:py-16">
      <section className="mx-auto max-w-5xl rounded-3xl border border-surface-container-high bg-white p-6 shadow-sm sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Welcome to MiseChef</p>
          <h1 className="mt-3 font-display text-4xl font-bold text-primary sm:text-5xl">What would you like to do with MiseChef?</h1>
          <p className="mt-4 font-sans text-sm font-bold text-on-surface-variant sm:text-base">Choose one or more. You can use every part of MiseChef later.</p>
        </div>

        <div className="mt-9 grid gap-4 lg:grid-cols-3">
          {choices.map(choice => {
            const Icon = choice.icon;
            const isSelected = selected.includes(choice.goal);
            return (
              <button
                key={choice.goal}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(choice.goal)}
                className={`relative rounded-2xl border p-5 text-left transition ${isSelected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-surface-container-high bg-surface-container-low hover:border-primary/30'}`}
              >
                <span className={`inline-flex rounded-full p-3 ${isSelected ? 'bg-primary text-on-primary' : 'bg-white text-primary'}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {isSelected && <span className="absolute right-4 top-4 rounded-full bg-primary p-1 text-on-primary"><Check className="h-4 w-4" /></span>}
                <span className="mt-5 block font-display text-xl font-bold text-primary">{choice.title}</span>
                <span className="mt-2 block font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{choice.description}</span>
                <span className="mt-4 flex flex-wrap gap-2">
                  {choice.details.map(detail => <span key={detail} className="rounded-full bg-white px-2.5 py-1 font-sans text-[10px] font-extrabold text-primary">{detail}</span>)}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p role="alert" className="mt-5 text-center font-sans text-sm font-bold text-error">{error}</p>}
        <div className="mt-8 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          <button type="button" disabled={isSaving} onClick={onSkip} className="rounded-full px-6 py-3 font-sans text-sm font-extrabold text-on-surface-variant disabled:opacity-50">Skip for now</button>
          <button type="button" disabled={isSaving || selected.length === 0} onClick={() => onContinue(selected)} className="rounded-full bg-primary px-7 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm disabled:cursor-not-allowed disabled:opacity-40">
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </section>
    </main>
  );
}
