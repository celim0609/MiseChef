import type { PortfolioContact } from '../types';

interface ContactManagerProps {
  contact: PortfolioContact;
  onChange: (contact: PortfolioContact) => void;
}

export default function ContactManager({ contact, onChange }: ContactManagerProps) {
  const updateContact = (field: keyof PortfolioContact, value: string | boolean) => {
    onChange({
      ...contact,
      [field]: value
    });
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Chef Profile Studio</p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Contact</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Email</span>
          <input type="email" value={contact.email || ''} onChange={event => updateContact('email', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Phone</span>
          <input type="tel" value={contact.phone || ''} onChange={event => updateContact('phone', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Location</span>
          <input type="text" value={contact.location || ''} onChange={event => updateContact('location', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Contact Message</span>
          <textarea value={contact.message || ''} onChange={event => updateContact('message', event.target.value)} rows={4} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3">
          <input type="checkbox" checked={contact.showEmail} onChange={event => updateContact('showEmail', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Show Email</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3">
          <input type="checkbox" checked={contact.showPhone} onChange={event => updateContact('showPhone', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Show Phone</span>
        </label>
      </div>
    </section>
  );
}
