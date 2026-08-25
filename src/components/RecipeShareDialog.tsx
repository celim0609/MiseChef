/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, QrCode, Share2, X } from 'lucide-react';
import type { Recipe } from '../types';
import {
  createRecipeQrBlob,
  createRecipeQrDataUrl,
  getPublicRecipeUrl,
  getRecipeQrFileName,
  getRecipeShareData
} from '../modules/public/recipeSharing';

interface RecipeShareDialogProps {
  recipe: Recipe;
  onClose: () => void;
}

export default function RecipeShareDialog({ recipe, onClose }: RecipeShareDialogProps) {
  const isPublic = recipe.visibility === 'public';
  const publicUrl = useMemo(
    () => getPublicRecipeUrl(window.location.origin, recipe.id),
    [recipe.id]
  );
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [message, setMessage] = useState('');
  const supportsNativeShare = typeof navigator.share === 'function';

  useEffect(() => {
    if (!isPublic) {
      setQrDataUrl('');
      setIsGeneratingQr(false);
      return;
    }

    let isCancelled = false;
    setIsGeneratingQr(true);
    setQrDataUrl('');
    setMessage('');
    createRecipeQrDataUrl(publicUrl)
      .then(dataUrl => {
        if (!isCancelled) setQrDataUrl(dataUrl);
      })
      .catch(error => {
        console.error('Recipe QR generation failed.', error);
        if (!isCancelled) setMessage('Unable to create the QR code. Please try again.');
      })
      .finally(() => {
        if (!isCancelled) setIsGeneratingQr(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isPublic, publicUrl]);

  useEffect(() => {
    if (!qrDataUrl) {
      setQrDownloadUrl('');
      return;
    }

    try {
      const downloadUrl = URL.createObjectURL(createRecipeQrBlob(qrDataUrl));
      setQrDownloadUrl(downloadUrl);
      return () => URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Recipe QR download preparation failed.', error);
      setQrDownloadUrl('');
      setMessage('Unable to prepare the QR code download. Please try again.');
    }
  }, [qrDataUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Public Recipe link copied.');
    } catch {
      setMessage('Copy failed. Select the link and copy it manually.');
    }
  };

  const shareRecipe = async () => {
    if (!supportsNativeShare) return;
    try {
      await navigator.share(getRecipeShareData(window.location.origin, recipe));
      setMessage('Recipe shared.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('Unable to open sharing. Copy the public link instead.');
    }
  };

  const downloadQrCode = () => {
    if (!qrDownloadUrl) return;
    const link = document.createElement('a');
    link.href = qrDownloadUrl;
    link.download = getRecipeQrFileName(recipe);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setMessage('Recipe QR code downloaded.');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-primary/50 p-0 sm:items-center sm:p-6" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-recipe-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Public Recipe</p>
            <h2 id="share-recipe-title" className="mt-1 font-display text-3xl font-bold text-primary">Share Recipe</h2>
            <p className="mt-2 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
              {isPublic
                ? 'Anyone with this link can view the public Recipe without a MiseChef account.'
                : 'This Recipe is Workspace-only and cannot be opened through a public link.'}
            </p>
          </div>
          <button type="button" aria-label="Close Recipe sharing" onClick={onClose} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-5 w-5" /></button>
        </div>

        {!isPublic ? (
          <div className="mt-6 rounded-3xl border border-surface-container-high bg-surface-container-low p-5">
            <p className="font-sans text-sm font-extrabold text-primary">Private · Workspace only</p>
            <p className="mt-2 font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Change Visibility to Public in Edit Recipe before sharing it outside this Workspace. No public link or QR code has been created here.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-3xl bg-surface-container-low p-5 text-center">
              {isGeneratingQr ? (
                <div className="mx-auto h-56 w-56 animate-pulse rounded-2xl bg-white" aria-label="Generating Recipe QR code" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ${recipe.title}`} className="mx-auto h-56 w-56 rounded-2xl bg-white" />
              ) : (
                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-white text-outline"><QrCode className="h-12 w-12" /></div>
              )}
              <p className="mt-4 font-sans text-xs font-extrabold text-primary">Scan to view Recipe</p>
            </div>

            <label className="mt-5 block">
              <span className="font-sans text-xs font-extrabold text-primary">Public Recipe link</span>
              <input readOnly value={publicUrl} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-xs font-bold text-primary outline-none" />
            </label>

            <div className={`mt-4 grid gap-2 ${supportsNativeShare ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {supportsNativeShare && (
                <button type="button" onClick={shareRecipe} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"><Share2 className="h-4 w-4" /> Share</button>
              )}
              <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"><Copy className="h-4 w-4" /> Copy Link</button>
              <button type="button" onClick={downloadQrCode} disabled={!qrDataUrl || !qrDownloadUrl || isGeneratingQr} className="inline-flex items-center justify-center gap-2 rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50"><Download className="h-4 w-4" /> Download QR</button>
            </div>
          </>
        )}

        {message && <p role="status" className="mt-3 text-center font-sans text-xs font-bold text-on-surface-variant">{message}</p>}
      </section>
    </div>
  );
}

