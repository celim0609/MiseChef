export default function PublicAboutPage() {
  return (
    <article className="mx-auto max-w-4xl">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">About MiseChef</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-primary sm:text-5xl">About Us</h1>
      <div className="mt-7 space-y-4 rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold leading-7 text-on-surface-variant">
        <p>MiseChef is a food technology and software platform operated by CL WISE EMPIRE in Malaysia.</p>
        <p>The platform provides subscription-based digital tools for chefs and food businesses, including recipe management, food costing, kitchen and business operations, alongside public recipe, chef and online store experiences.</p>
        <p>MiseChef also enables food businesses to present their products and receive customer orders through their public store pages.</p>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold text-primary">Business Identity</h2>
        <dl className="mt-3 rounded-2xl border border-surface-container-high bg-surface-container-low p-5 font-sans text-sm font-bold leading-7 text-on-surface-variant">
          <div><dt className="inline font-extrabold text-primary">Brand:</dt> <dd className="inline">MiseChef</dd></div>
          <div><dt className="inline font-extrabold text-primary">Operator:</dt> <dd className="inline">CL WISE EMPIRE</dd></div>
          <div><dt className="inline font-extrabold text-primary">Business Registration No.:</dt> <dd className="inline">202603223516 (003882452-K)</dd></div>
          <div><dt className="inline font-extrabold text-primary">Country:</dt> <dd className="inline">Malaysia</dd></div>
        </dl>
      </section>
    </article>
  );
}
