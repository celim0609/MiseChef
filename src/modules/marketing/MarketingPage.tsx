import { useMemo, useState, type FormEvent } from 'react';
import { Bot, Calculator, LayoutDashboard, ReceiptText, Send, Store, UtensilsCrossed } from 'lucide-react';
import { collection, doc, setDoc } from 'firebase/firestore';
import BrandLogo from '../../components/BrandLogo';
import { db } from '../../firebase';

interface MarketingPageProps {
  initialSection?: string;
}

interface EnquiryFormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  businessType: string;
  outletCount: string;
  message: string;
}

const emptyEnquiry: EnquiryFormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  country: '',
  businessType: '',
  outletCount: '',
  message: ''
};

const features = [
  {
    title: 'AI Invoice OCR',
    description: 'Turn supplier invoices into structured purchasing data for review and approval.',
    icon: <ReceiptText className="h-5 w-5" />
  },
  {
    title: 'Recipe Costing',
    description: 'Keep recipe costs visible as ingredients and supplier prices change.',
    icon: <Calculator className="h-5 w-5" />
  },
  {
    title: 'Supplier Management',
    description: 'Manage supplier records, quotation history, and future marketplace workflows.',
    icon: <Store className="h-5 w-5" />
  },
  {
    title: 'AI Recipe Assistant',
    description: 'Use AI to support recipe capture, structuring, and kitchen documentation.',
    icon: <Bot className="h-5 w-5" />
  },
  {
    title: 'Business Dashboard',
    description: 'See daily sales, purchases, invoices, ingredients, and action items in one view.',
    icon: <LayoutDashboard className="h-5 w-5" />
  }
];

const pricingPlans = [
  { name: 'Free', price: '$0', description: 'Start with basic recipe and AI tools.', features: ['25 AI requests', 'Recipe library', 'Basic invoice tracking'] },
  { name: 'Starter', price: 'Coming Soon', description: 'For small kitchens getting organized.', features: ['More AI requests', 'Supplier records', 'Invoice workflows'] },
  { name: 'Professional', price: 'Coming Soon', description: 'For growing culinary teams.', features: ['Advanced reports', 'Team management', 'Recipe costing'] },
  { name: 'Business', price: 'Coming Soon', description: 'For multi-outlet operations.', features: ['Higher limits', 'Business dashboards', 'Operational controls'] }
];

const navItems = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Book a Demo', href: '/book-demo' }
];

const getInitialAnchor = (section?: string) => {
  if (section === 'features') return '#features';
  if (section === 'pricing') return '#pricing';
  if (section === 'book-demo') return '#book-demo';
  if (section === 'contact') return '#contact';
  return '#top';
};

export default function MarketingPage({ initialSection }: MarketingPageProps) {
  const [form, setForm] = useState<EnquiryFormState>(emptyEnquiry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const activeAnchor = useMemo(() => getInitialAnchor(initialSection), [initialSection]);

  const updateForm = <K extends keyof EnquiryFormState>(field: K, value: EnquiryFormState[K]) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrorMessage('');
    setMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim() || !form.company.trim() || !form.email.trim()) {
      setErrorMessage('Please enter your name, company, and email.');
      return;
    }

    if (!db) {
      setErrorMessage("We can't accept demo requests in the app right now. Please email hello@misechef.ai.");
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setErrorMessage('');
    try {
      const enquiryRef = doc(collection(db, 'enquiries'));
      await setDoc(enquiryRef, {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        businessType: form.businessType.trim(),
        outletCount: form.outletCount.trim(),
        message: form.message.trim(),
        createdAt: new Date().toISOString()
      });
      setForm(emptyEnquiry);
      setMessage('Thanks. Your demo enquiry has been received.');
    } catch (err) {
      setErrorMessage('We could not save your enquiry. Please try again or email hello@misechef.ai.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="top" className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-50 border-b border-surface-container-high bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="MiseChef AI home">
            <BrandLogo className="h-8 w-auto" />
            <div>
              <p className="font-display text-2xl font-bold italic text-primary">MiseChef AI</p>
              <p className="font-sans text-[9px] font-extrabold uppercase tracking-[0.18em] text-outline">Culinary operations platform</p>
            </div>
          </a>
          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map(item => (
              <a key={item.href} href={item.href} className="rounded-full px-4 py-2 font-sans text-xs font-extrabold text-primary hover:bg-surface-container">
                {item.label}
              </a>
            ))}
            <a href="/login" className="rounded-full bg-primary px-5 py-2.5 font-sans text-xs font-extrabold text-on-primary shadow-sm">Login</a>
          </nav>
          <a href="/login" className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary md:hidden">Login</a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <span className="w-fit rounded-full bg-secondary/10 px-4 py-2 font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
              Built for modern kitchens
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold tracking-tight text-primary sm:text-6xl lg:text-7xl">
              AI-Powered Culinary Management Platform
            </h1>
            <p className="mt-6 max-w-2xl font-sans text-lg font-bold leading-relaxed text-on-surface-variant">
              Manage recipes, suppliers, invoices, costing, and kitchen operations with AI.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/login" className="inline-flex justify-center rounded-full bg-primary px-6 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm transition hover:opacity-95">
                Start Free
              </a>
              <a href="/book-demo" className="inline-flex justify-center rounded-full border border-primary/20 bg-white px-6 py-3 font-sans text-sm font-extrabold text-primary transition hover:bg-primary/5">
                Book Demo
              </a>
            </div>
          </div>
          <div className="rounded-3xl border border-surface-container-high bg-white p-5 shadow-xl shadow-primary/10">
            <div className="rounded-2xl bg-surface-container-low p-5">
              <div className="grid grid-cols-2 gap-3">
                {['Invoices processed', 'Recipe costs', 'Suppliers', 'AI tasks'].map((label, index) => (
                  <div key={label} className="rounded-2xl border border-surface-container-high bg-white p-4">
                    <p className="font-display text-3xl font-bold text-primary">{['128', '94%', '36', '2.4k'][index]}</p>
                    <p className="mt-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary p-3 text-on-primary"><UtensilsCrossed className="h-5 w-5" /></span>
                  <div>
                    <p className="font-sans text-sm font-extrabold text-primary">Daily kitchen command center</p>
                    <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Recipes, purchasing, suppliers, and AI workflows in one place.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className={`border-y border-surface-container-high bg-surface-container-low px-4 py-16 sm:px-6 lg:px-8 ${activeAnchor === '#features' ? 'scroll-mt-24' : ''}`}>
          <div className="mx-auto max-w-7xl">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Features</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-primary">Built for culinary operations</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {features.map(feature => (
                <article key={feature.title} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
                  <span className="inline-flex rounded-full bg-primary/10 p-3 text-primary">{feature.icon}</span>
                  <h3 className="mt-5 font-sans text-base font-extrabold text-primary">{feature.title}</h3>
                  <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Pricing</p>
          <h2 className="mt-3 font-display text-4xl font-bold text-primary">Plans for every kitchen stage</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {pricingPlans.map(plan => (
              <article key={plan.name} className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm">
                <h3 className="font-display text-2xl font-bold text-primary">{plan.name}</h3>
                <p className="mt-3 font-display text-3xl font-bold text-secondary">{plan.price}</p>
                <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">{plan.description}</p>
                <ul className="mt-5 space-y-2">
                  {plan.features.map(item => <li key={item} className="font-sans text-sm font-bold text-primary">• {item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="book-demo" className="border-y border-surface-container-high bg-surface-container-low px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Book a Demo</p>
              <h2 className="mt-3 font-display text-4xl font-bold text-primary">See MiseChef AI in your workflow</h2>
              <p className="mt-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
                Tell us about your kitchen, restaurant group, school, hotel, or food operation. We will use your enquiry to prepare a relevant walkthrough.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
              {(message || errorMessage) && (
                <p className={`mb-4 rounded-xl border p-3 font-sans text-sm font-bold ${errorMessage ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>
                  {errorMessage || message}
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input value={form.name} onChange={event => updateForm('name', event.target.value)} placeholder="Name" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input value={form.company} onChange={event => updateForm('company', event.target.value)} placeholder="Company" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} placeholder="Email" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input value={form.phone} onChange={event => updateForm('phone', event.target.value)} placeholder="Phone" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input value={form.country} onChange={event => updateForm('country', event.target.value)} placeholder="Country" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input value={form.businessType} onChange={event => updateForm('businessType', event.target.value)} placeholder="Business Type" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <input value={form.outletCount} onChange={event => updateForm('outletCount', event.target.value)} placeholder="Number of Outlets" className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary" />
                <textarea value={form.message} onChange={event => updateForm('message', event.target.value)} placeholder="Message" rows={5} className="rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold outline-none focus:border-primary md:col-span-2" />
              </div>
              <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-60 md:w-auto">
                <Send className="h-4 w-4" /> {isSubmitting ? 'Sending...' : 'Submit Enquiry'}
              </button>
            </form>
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-surface-container-high bg-primary p-8 text-on-primary shadow-sm">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-on-primary/70">Contact</p>
            <h2 className="mt-3 font-display text-4xl font-bold">Let’s talk about your kitchen operations.</h2>
            <p className="mt-4 font-sans text-sm font-bold text-on-primary/80">Company email: hello@misechef.ai</p>
          </div>
        </section>
      </main>
    </div>
  );
}
