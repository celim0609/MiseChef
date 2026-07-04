import type { PortfolioContact } from '../types';

interface ContactPreviewProps {
  contact?: PortfolioContact;
}

const hasContactContent = (contact?: PortfolioContact) => Boolean(
  contact?.message?.trim() ||
  contact?.location?.trim() ||
  (contact?.showEmail && contact.email?.trim()) ||
  (contact?.showPhone && contact.phone?.trim())
);

export default function ContactPreview({ contact }: ContactPreviewProps) {
  if (!hasContactContent(contact)) return null;

  return (
    <section className="animate-fade-in pb-10">
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Contact</p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">Let's Connect</h3>
        </div>

        {contact?.message && <p className="font-sans text-sm sm:text-base font-bold text-on-surface-variant max-w-3xl">{contact.message}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {contact?.showEmail && contact.email && (
            <a href={'mailto:' + contact.email} className="rounded-2xl bg-white border border-surface-container-high p-4 font-sans text-sm font-extrabold text-primary break-words">
              {contact.email}
            </a>
          )}
          {contact?.showPhone && contact.phone && (
            <a href={'tel:' + contact.phone} className="rounded-2xl bg-white border border-surface-container-high p-4 font-sans text-sm font-extrabold text-primary break-words">
              {contact.phone}
            </a>
          )}
          {contact?.location && (
            <div className="rounded-2xl bg-white border border-surface-container-high p-4 font-sans text-sm font-extrabold text-primary">
              {contact.location}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
