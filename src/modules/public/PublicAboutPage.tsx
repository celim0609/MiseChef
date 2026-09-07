const founderImages = {
  founder: '/images/about/ce-lim-chef.jpg',
  notebook: '/images/about/recipe-notebook.jpg',
  kitchenPrimary: '/images/about/kitchen-work-02.jpg',
  kitchenClosing: '/images/about/kitchen-work-01.jpg'
} as const;

const ProductKnowledgePreview = () => (
  <div className="overflow-hidden rounded-3xl border border-surface-container-high bg-background shadow-xl shadow-primary/10" aria-label="Current MiseChef Recipe and Costing structure">
    <div className="flex items-center justify-between border-b border-surface-container-high bg-surface-container-low px-4 py-3 sm:px-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-secondary">MiseChef recipe workspace</p>
        <p className="mt-1 font-display text-xl font-bold text-primary">Banana Bread / Muffin</p>
      </div>
      <span className="rounded-full bg-primary px-3 py-1.5 font-sans text-[10px] font-extrabold text-on-primary">Recipe</span>
    </div>

    <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.08fr_0.92fr]">
      <section aria-labelledby="about-recipe-structure-title">
        <h3 id="about-recipe-structure-title" className="font-display text-lg font-bold text-primary">Recipe information</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-container-low p-3">
            <dt className="font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Yield</dt>
            <dd className="mt-1 font-sans text-sm font-extrabold text-primary">12 small cupcakes</dd>
          </div>
          <div className="rounded-xl bg-surface-container-low p-3">
            <dt className="font-sans text-[10px] font-bold uppercase tracking-wider text-outline">Servings</dt>
            <dd className="mt-1 font-sans text-sm font-extrabold text-primary">12</dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="font-display text-lg font-bold text-primary">Ingredients</p>
          <div className="mt-2 overflow-hidden rounded-xl border border-surface-container-high">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] gap-2 bg-surface-container-low px-3 py-2 font-sans text-[10px] font-extrabold uppercase tracking-wider text-outline">
              <span>Ingredient</span><span>Quantity</span><span>Unit</span>
            </div>
            {[
              ['Banana', '900', 'g'],
              ['Milk', '360', 'g'],
              ['Olive oil', '420', 'g'],
              ['Eggs', '12', 'pcs'],
              ['Sugar', '400', 'g']
            ].map(([ingredient, quantity, unit]) => (
              <div key={ingredient} className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] gap-2 border-t border-surface-container-high px-3 py-2.5 font-sans text-xs first:border-t-0">
                <span className="font-extrabold text-primary">{ingredient}</span>
                <span className="font-bold tabular-nums text-on-surface-variant">{quantity}</span>
                <span className="font-bold text-on-surface-variant">{unit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4" aria-labelledby="about-cost-analysis-title">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-secondary">Linked professional knowledge</p>
        <h3 id="about-cost-analysis-title" className="mt-1 font-display text-lg font-bold text-primary">Cost Analysis</h3>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {['Total Cost', 'Per Portion', 'Selling Price', 'Food Cost'].map(label => (
            <div key={label} className="rounded-xl border border-surface-container-high bg-surface-container-low p-3">
              <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-outline">{label}</p>
              <p className="mt-1 font-sans text-sm font-extrabold text-primary">—</p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-sans text-xs font-bold leading-5 text-on-surface-variant">Cost information is connected when recipe ingredients are linked to priced Ingredient Library items.</p>
      </section>
    </div>
  </div>
);

export default function PublicAboutPage() {
  return (
    <article className="overflow-hidden">
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">From the kitchen to MiseChef</p>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[1.03] tracking-tight text-primary sm:text-6xl lg:text-7xl">I didn’t start MiseChef because I wanted to build software.</h1>
          <p className="mt-7 max-w-xl font-sans text-lg font-bold leading-8 text-on-surface-variant">I started it because, as a chef, I kept running into the same problems — and I began wondering why there wasn’t a better way.</p>
          <div className="mt-9 border-l-2 border-secondary pl-4">
            <p className="font-display text-2xl font-bold text-primary">Ce Lim</p>
            <p className="mt-1 font-sans text-sm font-extrabold text-on-surface-variant">Chef &amp; Founder, MiseChef</p>
          </div>
        </div>
        <figure className="mx-auto w-full max-w-xl lg:max-w-none">
          <img src={founderImages.founder} alt="Ce Lim, chef and founder of MiseChef, standing in a professional kitchen" width="1086" height="1448" fetchPriority="high" decoding="async" className="aspect-[3/4] w-full rounded-[2rem] object-cover object-center shadow-xl shadow-primary/10" />
        </figure>
      </section>

      <section className="border-y border-surface-container-high bg-surface-container-low">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-8 lg:py-24">
          <figure>
            <img src={founderImages.notebook} alt="Ce Lim’s handwritten banana bread and muffin recipe notebook with revised quantities and temperatures" width="1152" height="1536" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-[2rem] object-cover object-center shadow-lg" />
          </figure>
          <div className="max-w-xl lg:justify-self-end">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">The beginning</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl">This is where it started.</h2>
            <div className="mt-7 space-y-5 font-sans text-base font-bold leading-8 text-on-surface-variant sm:text-lg">
              <p>Recipes written by hand.<br />Portions adjusted along the way.<br />Temperatures crossed out and rewritten.</p>
              <p>Supplier information somewhere else.<br />Costing in another file.<br />Other things simply remembered.</p>
              <p>None of this was unusual.</p>
              <p className="font-extrabold text-primary">It was just how kitchens worked.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-8 lg:py-24">
        <div className="order-2 max-w-xl lg:order-1">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Real kitchen life</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl">Built from real kitchen problems.</h2>
          <div className="mt-7 space-y-5 font-sans text-base font-bold leading-8 text-on-surface-variant">
            <p>Working in professional kitchens taught me that cooking is only one part of being a chef.</p>
            <p>Behind every dish are recipes, ingredients, costing, suppliers, purchasing, documentation, people and hundreds of small decisions.</p>
            <p>Yet the information behind all of that is often scattered across notebooks, spreadsheets, messages, photos — and our own memory.</p>
          </div>
          <blockquote className="mt-9 border-l-2 border-secondary pl-5 font-display text-3xl font-bold leading-tight text-primary">The more I worked, the more I felt that chefs deserved better tools.</blockquote>
        </div>
        <figure className="order-1 lg:order-2">
          <img src={founderImages.kitchenPrimary} alt="Ce Lim preparing desserts with a culinary torch in a working professional kitchen" width="1152" height="1536" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-[2rem] object-cover object-center shadow-lg" />
        </figure>
      </section>

      <section className="bg-primary text-on-primary">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-sans text-sm font-extrabold text-on-primary/75">I kept coming back to one question.</p>
          <h2 className="mx-auto mt-7 max-w-4xl font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">Why don’t chefs have professional tools built around the way we actually work?</h2>
          <p className="mt-8 font-sans text-base font-extrabold text-on-primary/80">That question eventually became MiseChef.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">A better home for the work</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl">From problem to product.</h2>
          <p className="mt-6 whitespace-pre-line font-display text-3xl font-bold leading-tight text-primary">One problem became an idea.{`\n`}That idea became MiseChef.</p>
          <div className="mt-6 space-y-3 font-sans text-base font-bold leading-8 text-on-surface-variant">
            <p>I was not trying to build another generic restaurant system.</p>
            <p>I wanted to create something around the way chefs actually work.</p>
          </div>
        </div>

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:gap-8">
          <figure className="overflow-hidden rounded-3xl border border-surface-container-high bg-surface-container-low">
            <img src={founderImages.notebook} alt="The handwritten recipe notebook where kitchen knowledge was first recorded" width="1152" height="1536" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover object-top lg:aspect-auto lg:h-[32rem]" />
            <figcaption className="p-4 font-sans text-sm font-extrabold text-primary">Before, this knowledge lived here.</figcaption>
          </figure>
          <div>
            <ProductKnowledgePreview />
            <p className="mt-4 pl-1 font-sans text-sm font-extrabold text-primary">Now, I am trying to build a better home for it.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-surface-container-high bg-surface-container-low">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Knowledge has value</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl">Why MiseChef</h2>
          <div className="mt-8 grid gap-8 font-sans text-base font-bold leading-8 text-on-surface-variant md:grid-cols-2 md:gap-12">
            <div className="space-y-5">
              <p className="font-display text-2xl font-bold leading-snug text-primary">I believe a chef’s knowledge has value.</p>
              <p>The recipes we create, the systems we build, the experience we gain and the decisions we make every day should not simply disappear inside one kitchen.</p>
              <p>Chefs should be able to preserve that knowledge, improve it, understand the business behind it and build something from the experience they spend years earning.</p>
            </div>
            <div className="space-y-5">
              <p>For me, better tools are only part of the goal.</p>
              <p>I also want chefs to have more ways to turn what they know and create into real opportunities — whether that means building their career, collaborating with others, developing their professional identity or creating a food business of their own.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h2 className="font-display text-4xl font-bold text-primary sm:text-5xl">More than a recipe app.</h2>
        <div className="mt-8 space-y-6 font-sans text-lg font-bold leading-9 text-on-surface-variant">
          <p>I want MiseChef to become a professional platform where chefs can manage their work, preserve their knowledge, understand their costs, work better with their teams, build their professional identity and turn what they create into real opportunities — whether through their career, collaborations or their own food business.</p>
          <p>MiseChef is still growing, and I expect it to keep evolving with real chefs and real food businesses.</p>
          <p className="font-display text-2xl font-bold leading-snug text-primary">The goal is not to replace what makes a chef a chef. It is to make the work around the food more connected, more useful and easier to carry forward.</p>
        </div>
      </section>

      <section className="border-y border-surface-container-high bg-surface-container-low">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:px-8 lg:py-24">
          <figure>
            <img src={founderImages.kitchenClosing} alt="Ce Lim reading equipment instructions while working in a professional kitchen" width="768" height="1024" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-[2rem] object-cover object-center shadow-lg" />
          </figure>
          <div className="max-w-xl">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.2em] text-secondary">Built with the industry, not outside it</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-primary sm:text-5xl">Still built from the kitchen.</h2>
            <div className="mt-7 space-y-5 font-sans text-base font-bold leading-8 text-on-surface-variant">
              <p className="font-display text-2xl font-bold text-primary">I am still a working chef.</p>
              <p>That matters to me because MiseChef is not being built from the outside looking into the industry.</p>
              <p>Some ideas begin with something as simple as:</p>
              <blockquote className="border-l-2 border-secondary pl-4 font-display text-2xl font-bold leading-snug text-primary">“Why am I still doing this manually?”</blockquote>
              <p>or:</p>
              <blockquote className="border-l-2 border-secondary pl-4 font-display text-2xl font-bold leading-snug text-primary">“Why is this information so difficult to find?”</blockquote>
              <p>Then I try to build a better way.</p>
              <p>MiseChef will continue to change as real chefs and food businesses use it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <p className="font-sans text-sm font-extrabold text-on-surface-variant">MiseChef started with one chef asking why there wasn’t a better way.</p>
        <h2 className="mt-6 max-w-4xl font-display text-5xl font-bold leading-tight text-primary sm:text-6xl">Now I’m building that better way.</h2>
        <div className="mt-10 border-l-2 border-secondary pl-5">
          <p className="font-display text-2xl font-bold text-primary">Ce Lim</p>
          <p className="mt-1 font-sans text-sm font-extrabold text-on-surface-variant">Chef &amp; Founder</p>
          <p className="font-sans text-sm font-extrabold text-on-surface-variant">MiseChef</p>
        </div>

        <div className="mt-14 grid gap-6 rounded-3xl border border-surface-container-high bg-surface-container-low p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Business identity</p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 font-sans text-sm font-bold text-on-surface-variant sm:grid-cols-2">
              <div><dt className="inline font-extrabold text-primary">Brand:</dt> <dd className="inline">MiseChef</dd></div>
              <div><dt className="inline font-extrabold text-primary">Operator:</dt> <dd className="inline">CL WISE EMPIRE</dd></div>
              <div><dt className="inline font-extrabold text-primary">Business Registration No.:</dt> <dd className="inline">202603223516 (003882452-K)</dd></div>
              <div><dt className="inline font-extrabold text-primary">Country:</dt> <dd className="inline">Malaysia</dd></div>
            </dl>
          </div>
          <a href="/" className="inline-flex w-fit rounded-full border border-primary px-5 py-3 font-sans text-sm font-extrabold text-primary transition hover:bg-primary hover:text-on-primary">Explore MiseChef</a>
        </div>
      </section>
    </article>
  );
}
