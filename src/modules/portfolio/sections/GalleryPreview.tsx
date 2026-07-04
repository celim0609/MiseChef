import type { PortfolioGalleryItem } from '../types';

interface GalleryPreviewProps {
  items: PortfolioGalleryItem[];
}

const getPublicGalleryItems = (items: PortfolioGalleryItem[]) => (
  items
    .filter(item => item.visibility === 'public')
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function GalleryPreview({ items }: GalleryPreviewProps) {
  const publicItems = getPublicGalleryItems(items);

  if (publicItems.length === 0) return null;

  return (
    <section className="animate-fade-in pb-10">
      <div className="space-y-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Gallery
          </p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
            Culinary Gallery
          </h3>
        </div>

        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {publicItems.map(item => (
            <article key={item.id} className="break-inside-avoid rounded-2xl border border-surface-container-high bg-surface-container-low p-3 shadow-sm mb-4">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.title} className="w-full rounded-xl object-cover bg-surface-container" />
              ) : (
                <div className="h-48 rounded-xl bg-surface-container flex items-center justify-center font-sans text-xs font-extrabold text-outline uppercase tracking-[0.16em]">
                  Image pending
                </div>
              )}

              <div className="space-y-2 p-2 pt-4">
                <h4 className="font-display text-2xl font-bold text-primary tracking-tight">{item.title}</h4>
                {item.description && <p className="font-sans text-sm font-bold text-on-surface-variant">{item.description}</p>}
                {item.linkedRecipeTitle && (
                  <p className="font-sans text-xs font-extrabold text-outline">Recipe: {item.linkedRecipeTitle}</p>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map(tag => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1 font-sans text-xs font-extrabold text-primary">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
