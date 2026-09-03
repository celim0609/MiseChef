const complianceLinks = [
  ['Contact Us', '/contact-us'],
  ['Terms & Conditions', '/terms'],
  ['Privacy Policy', '/privacy'],
  ['Refund & Cancellation', '/refund-cancellation'],
  ['Payment Policy', '/payment-policy'],
  ['Pickup Policy', '/pickup-policy']
] as const;

export default function PublicComplianceFooter() {
  return (
    <footer className="border-t border-surface-container-high bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {complianceLinks.map(([label, href]) => (
            <a key={href} href={href} className="font-sans text-xs font-extrabold text-primary hover:underline">{label}</a>
          ))}
        </div>
        <div className="mt-5 font-sans text-xs font-bold leading-6 text-on-surface-variant">
          <p>MiseChef · Operated by CL WISE EMPIRE · Business Registration No. 003882452-K</p>
          <p>44, Laluan Pakatan Jaya 3, Taman Pakatan Jaya, 31150 Ulu Kinta, Perak, Malaysia</p>
          <p>Email: misechef.ai@gmail.com · Phone / WhatsApp: 016-420 9116</p>
        </div>
      </div>
    </footer>
  );
}
