import { useState, type ChangeEvent, type FormEvent } from 'react';
import { uploadPortfolioGalleryImage } from '../../../services/storage';
import type { PortfolioGalleryItem, PortfolioVisibility } from '../types';

interface GalleryManagerProps {
  items: PortfolioGalleryItem[];
  userId?: string;
  onChange: (items: PortfolioGalleryItem[]) => void;
}

type GalleryDraft = Omit<PortfolioGalleryItem, 'id' | 'sortOrder'>;

const recipeOptions = [
  { id: 'recipe_placeholder_signature', title: 'Signature recipe placeholder' },
  { id: 'recipe_placeholder_seasonal', title: 'Seasonal menu placeholder' }
];

const emptyDraft: GalleryDraft = {
  source: 'upload',
  imageUrl: '',
  imageFileName: '',
  title: '',
  description: '',
  tags: [],
  linkedRecipeId: '',
  linkedRecipeTitle: '',
  visibility: 'public'
};

const normalizeGalleryOrder = (items: PortfolioGalleryItem[]) => (
  items.map((item, index) => ({
    ...item,
    sortOrder: index
  }))
);

const getSortedItems = (items: PortfolioGalleryItem[]) => (
  [...items].sort((a, b) => a.sortOrder - b.sortOrder)
);

const createGalleryId = () => 'gallery_' + Date.now();

export default function GalleryManager({ items, userId, onChange }: GalleryManagerProps) {
  const [draft, setDraft] = useState<GalleryDraft>(emptyDraft);
  const [draftId, setDraftId] = useState(createGalleryId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');

  const sortedItems = getSortedItems(items);

  const updateDraft = (field: keyof GalleryDraft, value: string | string[]) => {
    setDraft(current => ({
      ...current,
      [field]: value
    }));
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setUploadError('Sign in to upload gallery images.');
      event.target.value = '';
      return;
    }

    setUploadProgress(0);
    setUploadError('');

    try {
      const imageUrl = await uploadPortfolioGalleryImage({
        userId,
        galleryItemId: editingId || draftId,
        file,
        onProgress: setUploadProgress,
      });

      setDraft(current => ({
        ...current,
        source: 'upload',
        imageFileName: file.name,
        imageUrl
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload gallery image.');
    } finally {
      setUploadProgress(null);
      event.target.value = '';
    }
  };

  const removeDraftImage = () => {
    setUploadError('');
    setUploadProgress(null);
    setDraft(current => ({
      ...current,
      imageFileName: '',
      imageUrl: ''
    }));
  };

  const handleRecipeSelect = (recipeId: string) => {
    const recipe = recipeOptions.find(item => item.id === recipeId);
    setDraft(current => ({
      ...current,
      source: 'recipe',
      linkedRecipeId: recipe?.id || '',
      linkedRecipeTitle: recipe?.title || '',
      title: current.title || recipe?.title || ''
    }));
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
    setDraftId(createGalleryId());
    setEditingId(null);
    setValidationMessage('');
    setUploadError('');
    setUploadProgress(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    setValidationMessage('');
    if (!title) {
      setValidationMessage('Add a title before adding this gallery item.');
      return;
    }

    const cleanDraft: GalleryDraft = {
      ...draft,
      title,
      description: draft.description?.trim(),
      tags: draft.tags?.map(item => item.trim()).filter(Boolean) || [],
      imageFileName: draft.imageFileName?.trim(),
      imageUrl: draft.imageUrl?.trim(),
      linkedRecipeId: draft.linkedRecipeId?.trim(),
      linkedRecipeTitle: draft.linkedRecipeTitle?.trim()
    };

    if (editingId) {
      onChange(normalizeGalleryOrder(sortedItems.map(item => (
        item.id === editingId ? { ...item, ...cleanDraft } : item
      ))));
      resetDraft();
      return;
    }

    onChange(normalizeGalleryOrder([
      ...sortedItems,
      {
        ...cleanDraft,
        id: draftId,
        sortOrder: sortedItems.length
      }
    ]));
    resetDraft();
  };

  const startEdit = (item: PortfolioGalleryItem) => {
    setDraft({
      source: item.source,
      imageUrl: item.imageUrl || '',
      imageFileName: item.imageFileName || '',
      title: item.title,
      description: item.description || '',
      tags: item.tags || [],
      linkedRecipeId: item.linkedRecipeId || '',
      linkedRecipeTitle: item.linkedRecipeTitle || '',
      visibility: item.visibility
    });
    setDraftId(item.id);
    setEditingId(item.id);
  };

  const deleteItem = (id: string) => {
    onChange(normalizeGalleryOrder(sortedItems.filter(item => item.id !== id)));
    if (editingId === id) resetDraft();
  };

  const toggleVisibility = (id: string) => {
    onChange(sortedItems.map(item => {
      if (item.id !== id) return item;
      const nextVisibility: PortfolioVisibility = item.visibility === 'public' ? 'private' : 'public';
      return {
        ...item,
        visibility: nextVisibility
      };
    }));
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Portfolio Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          Gallery
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Source</span>
          <select value={draft.source} onChange={event => updateDraft('source', event.target.value as GalleryDraft['source'])} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="upload">Upload Image</option>
            <option value="recipe">Select Existing Recipe</option>
          </select>
        </label>

        {draft.source === 'recipe' ? (
          <label className="block space-y-2">
            <span className="font-sans text-xs font-extrabold text-primary">Linked Recipe</span>
            <select value={draft.linkedRecipeId || ''} onChange={event => handleRecipeSelect(event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
              <option value="">Select placeholder recipe</option>
              {recipeOptions.map(recipe => (
                <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block space-y-2">
            <span className="font-sans text-xs font-extrabold text-primary">Upload Image</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-sans file:text-xs file:font-extrabold file:text-on-primary" />
            {draft.imageFileName && <span className="font-sans text-xs font-bold text-on-surface-variant">{draft.imageFileName}</span>}
            {uploadProgress !== null && <span className="font-sans text-xs font-extrabold text-secondary">Uploading... {uploadProgress}%</span>}
            {uploadError && <span className="font-sans text-xs font-extrabold text-error">{uploadError}</span>}
          </label>
        )}

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Title</span>
          <input type="text" required value={draft.title} onChange={event => updateDraft('title', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
          {validationMessage && <p className="font-sans text-xs font-bold text-secondary">{validationMessage}</p>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Visibility</span>
          <select value={draft.visibility} onChange={event => updateDraft('visibility', event.target.value as PortfolioVisibility)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Description</span>
          <textarea value={draft.description || ''} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Tags</span>
          <input type="text" value={(draft.tags || []).join(', ')} onChange={event => updateDraft('tags', event.target.value.split(',').map(item => item.trim()).filter(Boolean))} placeholder="Plating, Dessert, Private Dining" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        {draft.imageUrl && (
          <div className="md:col-span-2 rounded-2xl border border-surface-container-high bg-white p-3 space-y-3">
            <img src={draft.imageUrl} alt="" className="h-48 w-full rounded-xl object-cover" />
            <button type="button" onClick={removeDraftImage} className="rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">
              Remove Image
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all">
            {editingId ? 'Update Gallery Item' : 'Add Gallery Item'}
          </button>
          {editingId && (
            <button type="button" onClick={resetDraft} className="rounded-full border border-surface-container-high px-6 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedItems.length > 0 ? sortedItems.map(item => (
          <article key={item.id} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-48 w-full rounded-xl object-cover bg-surface-container" />
            ) : (
              <div className="h-48 rounded-xl bg-surface-container flex items-center justify-center font-sans text-xs font-extrabold text-outline uppercase tracking-[0.16em]">
                Image pending
              </div>
            )}

            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                {item.visibility === 'public' ? 'Public' : 'Private'} | {item.source === 'recipe' ? 'Recipe' : 'Upload'}
              </p>
              <h4 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">{item.title}</h4>
              {item.linkedRecipeTitle && (
                <p className="font-sans text-xs font-extrabold text-outline mt-1">Linked recipe: {item.linkedRecipeTitle}</p>
              )}
            </div>

            {item.description && <p className="font-sans text-sm font-bold text-on-surface-variant">{item.description}</p>}

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">{tag}</span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleVisibility(item.id)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle Visibility</button>
              <button type="button" onClick={() => startEdit(item)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Edit</button>
              <button type="button" onClick={() => deleteItem(item.id)} className="rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary">Delete</button>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-6 text-center md:col-span-2">
            <p className="font-sans text-sm font-bold text-on-surface-variant">
              No gallery items added yet. Add photos or recipe-linked work to showcase your style.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
