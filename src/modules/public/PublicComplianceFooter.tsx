const footerGroups = [
  {
    title: 'MiseChef',
    links: [
      ['Contact Us', '/contact-us'],
      ['Store', '/store'],
      ['Become a Host', '/host']
    ]
  },
  {
    title: 'Support',
    links: [
      ['Refund & Cancellation', '/refund-cancellation'],
      ['Payment Policy', '/payment-policy'],
      ['Pickup Policy', '/pickup-policy']
    ]
  },
  {
    title: 'Legal',
    links: [
      ['Terms & Conditions', '/terms'],
      ['Privacy Policy', '/privacy']
    ]
  }
] as const;

export default function PublicComplianceFooter() {
  return (
    <footer className="border-t border-surface-container-high bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-bold text-primary">MiseChef</p>
            <p className="mt-3 max-w-xs font-sans text-sm font-bold leading-6 text-on-surface-variant">Food ordering & kitchen operations.</p>
            <p className="mt-5 font-sans text-xs font-bold leading-6 text-on-surface-variant">Operated by CL WISE EMPIRE</p>
            <p className="font-sans text-xs font-bold leading-6 text-on-surface-variant">Business Registration No. 003882452-K</p>
          </div>

          {footerGroups.map(group => (
            <div key={group.title}>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-on-surface">{group.title}</p>
              <div className="mt-4 flex flex-col gap-3">
                {group.links.map(([label, href]) => (
                  <a key={href} href={href} className="font-sans text-sm font-bold text-on-surface-variant hover:text-primary hover:underline">{label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-surface-container-high pt-5 font-sans text-xs font-bold text-on-surface-variant">
          © 2026 MiseChef · Operated by CL WISE EMPIRE
        </div>
      </div>
    </footer>
  );
}
