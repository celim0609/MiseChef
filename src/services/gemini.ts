/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import {
  normalizeResumePortfolioDraft as normalizeResumePortfolioDraftModel,
  type GeminiResumePortfolioDraft
} from './resumePortfolioModel';
export type { GeminiResumePortfolioDraft } from './resumePortfolioModel';

export type GeminiScannedIngredient = {
  name: string;
  quantity: string;
  unit: string;
};

export type GeminiScannedRecipe = {
  title: string;
  description: string;
  yield: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  ingredients: GeminiScannedIngredient[];
  method: string[];
  notes: string;
};

const readFileAsBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
};

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getDataUrlMimeType = (dataUrl?: string) => {
  const match = dataUrl?.match(/^data:([^;,]+)[;,]/);
  return match?.[1] || '';
};

const getCallableErrorMessage = (err: unknown, fallbackMessage: string) => {
  const source = err && typeof err === 'object' ? err as Record<string, unknown> : {};
  const details = source.details && typeof source.details === 'object'
    ? source.details as Record<string, unknown>
    : {};
  const diagnostics = details.diagnostics && typeof details.diagnostics === 'object'
    ? details.diagnostics as Record<string, unknown>
    : {};
  const devMessage = [
    typeof source.message === 'string' ? source.message : '',
    typeof details.reason === 'string' ? `Reason: ${details.reason}` : '',
    typeof diagnostics.message === 'string' ? `Backend: ${diagnostics.message}` : '',
    typeof source.code === 'string' ? `Code: ${source.code}` : ''
  ].filter(Boolean).join(' | ');

  if (
    source.code === 'functions/failed-precondition' &&
    (details.reason === 'incomplete-extraction' || source.message === 'AI extraction incomplete.')
  ) {
    return 'AI extraction incomplete.';
  }

  return import.meta.env.DEV && devMessage ? devMessage : fallbackMessage;
};

const normalizeScannedRecipe = (parsed: unknown): GeminiScannedRecipe => {
  const source = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const rawIngredients = Array.isArray(source.ingredients) ? source.ingredients : [];
  const rawMethod = Array.isArray(source.method) ? source.method : [];

  const scannedRecipe = {
    title: readString(source.title),
    description: readString(source.description),
    yield: readString(source.yield),
    servings: readString(source.servings),
    prepTime: readString(source.prepTime),
    cookTime: readString(source.cookTime),
    ingredients: rawIngredients
      .map(item => {
        if (!item || typeof item !== 'object') {
          return { name: '', quantity: '', unit: '' };
        }
        const ingredient = item as Record<string, unknown>;
        return {
          name: readString(ingredient.name || ingredient.ingredientName || ingredient.ingredient || ingredient.item),
          quantity: readString(ingredient.quantity || ingredient.qty || ingredient.amount),
          unit: readString(ingredient.unit)
        };
      })
      .filter(ingredient => ingredient.name || ingredient.quantity || ingredient.unit),
    method: rawMethod.map(step => readString(step)).filter(Boolean),
    notes: readString(source.notes)
  };

  return scannedRecipe;
};

const parseScannedRecipeResponse = (value: unknown) => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!source.recipe || typeof source.recipe !== 'object') {
    throw new Error("We couldn't read the result. Please try again.");
  }

  return normalizeScannedRecipe(source.recipe);
};

export const generateRecipeStepsWithAI = async ({
  workspaceId,
  title,
  category,
  yield: recipeYield,
  ingredients
}: {
  workspaceId: string;
  title: string;
  category: string;
  yield: string;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
}) => {
  if (!functions) {
    throw new Error('AI is temporarily unavailable. Please try again shortly.');
  }

  const generateSteps = httpsCallable<
    {
      workspaceId: string;
      title: string;
      category: string;
      yield: string;
      ingredients: Array<{ name: string; qty: string; unit: string }>;
      debug?: boolean;
    },
    { steps: string[] }
  >(functions, 'generateRecipeSteps');

  const response = await generateSteps({
    workspaceId,
    title,
    category,
    yield: recipeYield,
    ingredients,
    debug: import.meta.env.DEV
  });

  return Array.isArray(response.data.steps)
    ? response.data.steps.map(step => readString(step)).filter(Boolean)
    : [];
};

export const scanRecipeImageWithGemini = async ({
  workspaceId,
  file,
  imageDataUrl,
  onStage
}: {
  workspaceId: string;
  file: File;
  imageDataUrl?: string;
  onStage?: (stage: 'reading' | 'extracting') => void;
}) => {
  if (!functions) {
    throw new Error('AI is temporarily unavailable. Please try again shortly.');
  }

  const imageBase64 = imageDataUrl?.split(',')[1] || await readFileAsBase64(file);
  const mimeType = getDataUrlMimeType(imageDataUrl) || file.type || 'image/jpeg';
  onStage?.('reading');
  console.info('[AI Scan] Invoking callable scanRecipeImage', {
    mimeType,
    imageBytesApprox: Math.round(imageBase64.length * 0.75),
    region: 'us-central1'
  });

  const scanImage = httpsCallable<
    { workspaceId: string; imageBase64: string; mimeType: string; debug?: boolean },
    { recipe: GeminiScannedRecipe }
  >(functions, 'scanRecipeImage');

  try {
    const response = await scanImage({
      workspaceId,
      imageBase64,
      mimeType,
      debug: import.meta.env.DEV
    });

    console.info('[AI Scan] Callable response received', {
      hasData: Boolean(response.data),
      hasRecipe: Boolean(response.data?.recipe)
    });
    onStage?.('extracting');
    const recipe = parseScannedRecipeResponse(response.data);
    console.info('[AI Scan] Callable response parsed', {
      titlePresent: Boolean(recipe.title),
      ingredientCount: recipe.ingredients.length,
      methodStepCount: recipe.method.length
    });
    return recipe;
  } catch (err) {
    console.error('[AI Scan] Callable failed', err);
    throw new Error(getCallableErrorMessage(err, 'We could not read this recipe. Please try again.'));
  }
};

export const parseResumeToPortfolioWithAI = async (resumeText: string, workspaceId: string) => {
  if (!functions) {
    throw new Error('AI is temporarily unavailable. Please try again shortly.');
  }

  const parseResume = httpsCallable<
    { workspaceId: string; resumeText: string; debug?: boolean },
    { portfolio: GeminiResumePortfolioDraft }
  >(functions, 'parseResumeToPortfolio');

  try {
    const response = await parseResume({
      workspaceId,
      resumeText,
      debug: import.meta.env.DEV
    });

    return normalizeResumePortfolioDraftModel(response.data?.portfolio);
  } catch (err) {
    throw new Error(getCallableErrorMessage(err, 'We could not import this resume. Please try again.'));
  }
};
