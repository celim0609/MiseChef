/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Plus, Grid2X2, AlignJustify, Folder, Heart, Clock, Check, X } from 'lucide-react';
import { Recipe, Collection } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface FavoritesTabProps {
  recipes: Recipe[];
  collections: Collection[];
  onAddCollection: (name: string, description: string, imgUrl: string) => void;
  onSelectRecipe: (recipe: Recipe) => void;
  onToggleSave: (recipeId: string) => void;
}

export default function FavoritesTab({
  recipes,
  collections,
  onAddCollection,
  onSelectRecipe,
  onToggleSave
}: FavoritesTabProps) {
  const [favoriteSearchQuery, setFavoriteSearchQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isGridLayout, setIsGridLayout] = useState(true);
  const [showNewCollectionModal, setShowNewCollectionModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColImg, setNewColImg] = useState('');

  // Sourced recipes that are saved (isSaved = true)
  const savedRecipes = useMemo(() => {
    return recipes.filter(r => r.isSaved);
  }, [recipes]);

  // Filtered by collection & search input
  const filteredSavedRecipes = useMemo(() => {
    return savedRecipes.filter(r => {
      const matchesSearch = 
        r.title.toLowerCase().includes(favoriteSearchQuery.toLowerCase()) ||
        r.chefName.toLowerCase().includes(favoriteSearchQuery.toLowerCase());
      
      const matchesCollection = !selectedCollectionId || r.collections.includes(selectedCollectionId);

      return matchesSearch && matchesCollection;
    });
  }, [savedRecipes, favoriteSearchQuery, selectedCollectionId]);

  // Handle addition of a new collection
  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName) return;

    // Use a lovely default image if they didn't provide one
    const finalImg = newColImg.trim() || 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&q=80&w=700';
    
    onAddCollection(newColName, newColDesc, finalImg);
    
    // reset form
    setNewColName('');
    setNewColDesc('');
    setNewColImg('');
    setShowNewCollectionModal(false);
  };

  // Get count of recipes in each collection based on saved recipes
  const getCollectionCount = (collectionId: string) => {
    return savedRecipes.filter(r => r.collections.includes(collectionId)).length;
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Top Search & Filter Bar Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div>
          <h2 className="font-display text-2xl sm:text-3.5xl font-bold text-primary tracking-tight leading-tight mb-1">
            Your Heirloom Collection
          </h2>
          <p className="font-sans text-xs sm:text-sm text-on-surface-variant/85 font-semibold">
            {savedRecipes.length} saved recipes across {collections.length} collections
          </p>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline w-5 h-5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search your favorites..."
              value={favoriteSearchQuery}
              onChange={e => setFavoriteSearchQuery(e.target.value)}
              className="w-full bg-surface-container-low hover:bg-surface-container border border-surface-container-high rounded-xl pl-12 pr-4 py-3 text-sm focus:ring-1 focus:ring-primary focus:bg-white transition-all font-semibold placeholder:text-outline/60"
            />
          </div>
          <button
            onClick={() => setShowNewCollectionModal(true)}
            id="new-collection-btn"
            className="bg-primary hover:bg-primary-container text-on-primary px-6 py-3 rounded-xl font-sans font-bold text-xs flex items-center gap-2 shadow-md shadow-primary/15 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Collection
          </button>
        </div>
      </div>

      {/* Collections Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-primary">Collections</h3>
          {selectedCollectionId && (
            <button
              onClick={() => setSelectedCollectionId(null)}
              className="text-secondary font-sans font-bold text-xs hover:underline decoration-2"
            >
              Clear Selected Folder
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map(col => {
            const isActive = selectedCollectionId === col.id;
            const rCount = getCollectionCount(col.id);
            return (
              <div
                key={col.id}
                onClick={() => setSelectedCollectionId(isActive ? null : col.id)}
                className={`group relative aspect-[16/10] rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all duration-300 border ${
                  isActive ? 'border-secondary ring-2 ring-secondary/20' : 'border-transparent'
                }`}
              >
                <img
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] duration-500 transition-transform"
                  src={col.coverImage}
                  alt={col.name}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/30 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-5 w-full">
                  <p className="text-white/85 font-sans font-bold text-[10px] tracking-widest uppercase mb-1">
                    {rCount} Recipes
                  </p>
                  <h4 className="text-white font-display font-bold text-lg sm:text-xl tracking-tight leading-snug group-hover:text-secondary-fixed-dim transition-colors">
                    {col.name}
                  </h4>
                </div>
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Folder className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recipe Masonry / List Area */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-t border-surface-container-high pt-6">
          <h3 className="font-display text-xl font-bold text-primary">
            {selectedCollectionId 
              ? `${collections.find(c => c.id === selectedCollectionId)?.name} Items (${filteredSavedRecipes.length})`
              : `All Saved Items (${filteredSavedRecipes.length})`
            }
          </h3>
          <div className="flex gap-2 bg-surface-container p-1 rounded-xl border border-surface-container-high shadow-inner">
            <button
              onClick={() => setIsGridLayout(true)}
              className={`p-2 rounded-lg transition-all ${
                isGridLayout ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-primary'
              }`}
            >
              <Grid2X2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsGridLayout(false)}
              className={`p-2 rounded-lg transition-all ${
                !isGridLayout ? 'bg-white text-primary shadow-sm' : 'text-outline hover:text-primary'
              }`}
            >
              <AlignJustify className="w-4 h-4" />
            </button>
          </div>
        </div>

        {filteredSavedRecipes.length === 0 ? (
          <div className="bg-surface-container/60 border border-dashed border-outline-variant rounded-2xl py-14 text-center text-on-surface-variant flex flex-col items-center justify-center space-y-3 px-4">
            <span className="text-3xl">📒</span>
            <p className="font-display text-lg font-bold text-primary">No recipes saved in here yet</p>
            <p className="text-xs max-w-xs font-semibold leading-relaxed">
              Explore recipes in our Discovery section or tap the Bookmark icon on any card to add them to your heirloom collection!
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className={isGridLayout ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
              {filteredSavedRecipes.map(recipe => (
                <motion.div
                  key={recipe.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => onSelectRecipe(recipe)}
                  className={`bg-surface-container-low border border-surface-container-high rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all group duration-350 relative ${
                    isGridLayout ? '' : 'flex flex-col sm:flex-row'
                  }`}
                >
                  <div className={`overflow-hidden relative ${
                    isGridLayout ? 'aspect-[4/3] w-full' : 'w-full sm:w-48 aspect-[16/10] sm:aspect-square flex-shrink-0'
                  }`}>
                    <img
                      className="w-full h-full object-cover group-hover:scale-102 duration-300 transition-transform"
                      src={recipe.coverImage}
                      alt={recipe.title}
                      referrerPolicy="no-referrer"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSave(recipe.id);
                      }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/70 backdrop-blur-sm shadow-sm flex items-center justify-center text-secondary active:scale-90 hover:scale-105 transition-all outline-none"
                    >
                      <Heart className="w-4 h-4 fill-secondary text-secondary" />
                    </button>
                  </div>

                  <div className={`p-4 flex flex-col justify-between flex-1 ${isGridLayout ? 'space-y-3' : 'space-y-2'}`}>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-sans text-[10px] font-bold">
                          {recipe.category.toUpperCase()}
                        </span>
                        {recipe.prepTime <= 15 && (
                          <span className="bg-secondary/10 text-secondary px-2.5 py-0.5 rounded-full font-sans text-[10px] font-bold">
                            QUICK BAKE
                          </span>
                        )}
                      </div>
                      <h5 className="font-display font-semibold text-base sm:text-lg text-primary leading-snug group-hover:text-secondary duration-300 transition-colors line-clamp-2">
                        {recipe.title}
                      </h5>
                      <p className="font-sans text-xs text-on-surface-variant font-semibold">
                        by {recipe.chefName}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-outline/80 font-semibold pt-1 border-t border-surface-container-high/40">
                      <Clock className="w-3.5 h-3.5 text-secondary" />
                      <span>{recipe.prepTime} Mins Prep</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </section>

      {/* New Collection Dialog Modal */}
      {showNewCollectionModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setShowNewCollectionModal(false)} />
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative bg-background max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-primary/15"
          >
            <div className="flex justify-between items-center border-b border-surface-container-high pb-3 mb-4">
              <h4 className="font-display text-lg font-bold text-primary flex items-center gap-2">
                <Folder className="w-5 h-5 text-secondary" />
                Create New Collection
              </h4>
              <button
                type="button"
                onClick={() => setShowNewCollectionModal(false)}
                className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 font-sans">
                  Collection Name (e.g., Summer Baking)
                </label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  placeholder="e.g. Sourdough Experiments"
                  className="w-full bg-surface-container border-none p-3 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:bg-white placeholder:text-outline-variant transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 font-sans">
                  Description
                </label>
                <textarea
                  value={newColDesc}
                  onChange={e => setNewColDesc(e.target.value)}
                  placeholder="Tell us what types of recipes go in... Is it a family brunch? Desserts?"
                  rows={2}
                  className="w-full bg-surface-container border-none p-3 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:bg-white resize-none placeholder:text-outline-variant transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1 font-sans">
                  Cover Photo URL (optional)
                </label>
                <input
                  type="url"
                  value={newColImg}
                  onChange={e => setNewColImg(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-surface-container border-none p-3 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:bg-white placeholder:text-outline-variant transition-all text-xs"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewCollectionModal(false)}
                  className="flex-1 py-2.5 text-xs bg-surface-container rounded-full font-bold hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs bg-primary text-on-primary rounded-full font-bold hover:bg-primary-container transition-colors"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
