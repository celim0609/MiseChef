import { Check, Sparkles, X } from 'lucide-react';
import type { PublicSubscriptionPlan, SubscriptionPlan } from '../../types';

type PlanExperience = {
  id: PublicSubscriptionPlan;
  name: string;
  eyebrow: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
};

type ComparisonValue = boolean | string;

const PRICING_PLANS: PlanExperience[] = [
  {
    id: 'free',
    name: 'Free',
    eyebrow: 'Free forever',
    description: 'Perfect for individual chefs getting started.',
    features: ['1 Workspace', 'Public Chef Profile', 'Public Store', 'QR Payments', 'WhatsApp', 'Notifications', 'Up to 20 Products', 'Up to 50 Orders / month'],
    cta: 'Get Started Free',
    href: '/login'
  },
  {
    id: 'starter',
    name: 'Starter',
    eyebrow: '14-day free trial',
    description: 'For home businesses and small cafés.',
    features: ['Everything in Free', 'Unlimited Products', 'Unlimited Orders', 'Stripe Payments', 'More Team Members', 'Better Reports'],
    cta: 'Start Free Trial',
    href: '/login?plan=starter'
  },
  {
    id: 'professional',
    name: 'Professional',
    eyebrow: '14-day free trial',
    description: 'For restaurants and growing businesses.',
    features: ['Everything in Starter', 'Recipe Costing', 'Inventory', 'Purchasing', 'Invoice OCR', 'AI Features'],
    cta: 'Start Free Trial',
    href: '/login?plan=professional',
    highlighted: true
  },
  {
    id: 'business',
    name: 'Business',
    eyebrow: 'Tailored rollout',
    description: 'For multi-location operations.',
    features: ['Everything in Professional', 'Unlimited Team Members', 'Multi-location Operations', 'Centralized Visibility', 'Guided Rollout'],
    cta: 'Contact Sales',
    href: '/book-demo?plan=business'
  }
];

const COMPARISON_ROWS: Array<{ feature: string; values: Record<PublicSubscriptionPlan, ComparisonValue> }> = [
  { feature: 'Public Chef Profile', values: { free: true, starter: true, professional: true, business: true } },
  { feature: 'Public Store', values: { free: true, starter: true, professional: true, business: true } },
  { feature: 'QR Payments', values: { free: true, starter: true, professional: true, business: true } },
  { feature: 'WhatsApp', values: { free: true, starter: true, professional: true, business: true } },
  { feature: 'Notifications', values: { free: true, starter: true, professional: true, business: true } },
  { feature: 'Stripe Payments', values: { free: false, starter: true, professional: true, business: true } },
  { feature: 'Products', values: { free: '20', starter: 'Unlimited', professional: 'Unlimited', business: 'Unlimited' } },
  { feature: 'Orders', values: { free: '50 / month', starter: 'Unlimited', professional: 'Unlimited', business: 'Unlimited' } },
  { feature: 'Team Members', values: { free: '1', starter: '3', professional: '10', business: 'Unlimited' } },
  { feature: 'Reports', values: { free: 'Basic', starter: 'Better', professional: 'Advanced', business: 'Multi-location' } },
  { feature: 'Recipe Costing', values: { free: false, starter: false, professional: true, business: true } },
  { feature: 'Inventory', values: { free: false, starter: false, professional: true, business: true } },
  { feature: 'Purchasing', values: { free: false, starter: false, professional: true, business: true } },
  { feature: 'Invoice OCR', values: { free: false, starter: false, professional: true, business: true } },
  { feature: 'AI Features', values: { free: false, starter: false, professional: true, business: true } }
];

const ComparisonValueDisplay = ({ value }: { value: ComparisonValue }) => {
  if (value === true) return <span className="inline-flex items-center justify-center" aria-label="Included"><Check className="h-5 w-5 text-secondary" strokeWidth={3} /></span>;
  if (value === false) return <span className="inline-flex items-center justify-center" aria-label="Not included"><X className="h-4 w-4 text-outline" strokeWidth={2.5} /></span>;
  return <span>{value}</span>;
};

interface PricingExperienceProps {
  currentPlan?: SubscriptionPlan;
  inApp?: boolean;
}

export default function PricingExperience({ currentPlan, inApp = false }: PricingExperienceProps) {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const href = inApp && plan.id !== 'business' ? `/contact?plan=${plan.id}` : plan.href;

          return (
            <article key={plan.id} className={`relative flex min-h-full flex-col overflow-hidden rounded-3xl border p-6 shadow-sm transition-transform duration-200 hover:-translate-y-1 ${plan.highlighted ? 'border-secondary bg-primary text-on-primary shadow-lg' : 'border-surface-container-high bg-white text-primary'}`}>
              {plan.highlighted && (
                <div className="absolute right-0 top-0 rounded-bl-2xl bg-secondary px-4 py-2 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-on-secondary">
                  Most Popular
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] ${plan.highlighted ? 'text-on-primary/65' : 'text-secondary'}`}>{plan.eyebrow}</p>
                  <h3 className="mt-2 font-display text-3xl font-bold">{plan.name}</h3>
                </div>
                {isCurrent && <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${plan.highlighted ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary'}`}>Current</span>}
              </div>
              <p className={`mt-4 min-h-12 font-sans text-sm font-bold leading-relaxed ${plan.highlighted ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-3 border-t border-current/10 pt-5">
                {plan.features.map(feature => (
                  <li key={feature} className="flex gap-2.5 font-sans text-sm font-bold">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.highlighted ? 'text-secondary' : 'text-secondary'}`} strokeWidth={3} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a href={href} className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-5 py-3 font-sans text-xs font-extrabold transition-colors ${plan.highlighted ? 'bg-secondary text-on-secondary hover:bg-secondary/90' : plan.id === 'business' ? 'border border-primary bg-transparent text-primary hover:bg-primary/5' : 'bg-primary text-on-primary hover:bg-primary/90'}`}>
                {plan.cta}
              </a>
            </article>
          );
        })}
      </div>

      <section aria-labelledby="plan-comparison-heading" className="overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-sm">
        <div className="border-b border-surface-container-high bg-surface-container-low px-5 py-6 sm:px-7">
          <div className="flex items-center gap-2 text-secondary">
            <Sparkles className="h-4 w-4" />
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em]">At a glance</p>
          </div>
          <h3 id="plan-comparison-heading" className="mt-2 font-display text-2xl font-bold text-primary">Compare every plan</h3>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Find the capabilities your kitchen needs today—and what becomes available as you grow.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-container-high bg-white">
                <th scope="col" className="sticky left-0 z-10 min-w-48 bg-white px-5 py-4 font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-on-surface-variant">Feature</th>
                {PRICING_PLANS.map(plan => <th key={plan.id} scope="col" className={`min-w-32 px-4 py-4 text-center font-display text-base font-bold ${plan.highlighted ? 'text-secondary' : 'text-primary'}`}>{plan.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, index) => (
                <tr key={row.feature} className={`border-b border-surface-container-high/70 last:border-0 ${index % 2 ? 'bg-surface-container-low/45' : 'bg-white'}`}>
                  <th scope="row" className={`sticky left-0 z-10 px-5 py-3.5 font-sans text-sm font-extrabold text-primary ${index % 2 ? 'bg-[#f7f6f2]' : 'bg-white'}`}>{row.feature}</th>
                  {PRICING_PLANS.map(plan => <td key={plan.id} className="px-4 py-3.5 text-center font-sans text-xs font-extrabold text-primary"><ComparisonValueDisplay value={row.values[plan.id]} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
