/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

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

export type GeminiResumePortfolioDraft = {
  basicProfile?: {
    professionalTitle?: string;
    yearsExperience?: string;
    shortBio?: string;
    quote?: string;
    location?: string;
    specialties?: string[];
  };
  about?: {
    title?: string;
    body?: string;
    quote?: string;
    highlights?: string[];
  };
  experience?: Array<{
    role?: string;
    organization?: string;
    location?: string;
    employmentType?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    achievements?: string[];
  }>;
  skills?: Array<{
    name?: string;
    category?: string;
    level?: string;
    description?: string;
  }>;
  certificates?: Array<{
    title?: string;
    issuer?: string;
    issueDate?: string;
    expiryDate?: string;
    credentialId?: string;
    credentialUrl?: string;
    description?: string;
    skillsCertified?: string[];
  }>;
  contact?: {
    email?: string;
    phone?: string;
    location?: string;
    message?: string;
  };
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

const readStringArray = (value: unknown) => Array.isArray(value)
  ? value.map(item => readString(item)).filter(Boolean)
  : [];

const normalizeResumePortfolioDraft = (value: unknown): GeminiResumePortfolioDraft => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const basicProfile = source.basicProfile && typeof source.basicProfile === 'object' ? source.basicProfile as Record<string, unknown> : {};
  const about = source.about && typeof source.about === 'object' ? source.about as Record<string, unknown> : {};
  const contact = source.contact && typeof source.contact === 'object' ? source.contact as Record<string, unknown> : {};
  const experience = Array.isArray(source.experience) ? source.experience : [];
  const skills = Array.isArray(source.skills) ? source.skills : [];
  const certificates = Array.isArray(source.certificates) ? source.certificates : [];

  return {
    basicProfile: {
      professionalTitle: readString(basicProfile.professionalTitle),
      yearsExperience: readString(basicProfile.yearsExperience),
      shortBio: readString(basicProfile.shortBio),
      quote: readString(basicProfile.quote),
      location: readString(basicProfile.location),
      specialties: readStringArray(basicProfile.specialties)
    },
    about: {
      title: readString(about.title),
      body: readString(about.body),
      quote: readString(about.quote),
      highlights: readStringArray(about.highlights)
    },
    experience: experience.map(item => {
      const exp = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        role: readString(exp.role),
        organization: readString(exp.organization),
        location: readString(exp.location),
        employmentType: readString(exp.employmentType),
        startDate: readString(exp.startDate),
        endDate: readString(exp.endDate),
        isCurrent: exp.isCurrent === true,
        description: readString(exp.description),
        achievements: readStringArray(exp.achievements)
      };
    }).filter(item => item.role || item.organization || item.description),
    skills: skills.map(item => {
      const skill = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        name: readString(skill.name),
        category: readString(skill.category),
        level: readString(skill.level),
        description: readString(skill.description)
      };
    }).filter(item => item.name),
    certificates: certificates.map(item => {
      const certificate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        title: readString(certificate.title),
        issuer: readString(certificate.issuer),
        issueDate: readString(certificate.issueDate),
        expiryDate: readString(certificate.expiryDate),
        credentialId: readString(certificate.credentialId),
        credentialUrl: readString(certificate.credentialUrl),
        description: readString(certificate.description),
        skillsCertified: readStringArray(certificate.skillsCertified)
      };
    }).filter(item => item.title),
    contact: {
      email: readString(contact.email),
      phone: readString(contact.phone),
      location: readString(contact.location),
      message: readString(contact.message)
    }
  };
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

    return normalizeResumePortfolioDraft(response.data?.portfolio);
  } catch (err) {
    throw new Error(getCallableErrorMessage(err, 'We could not import this resume. Please try again.'));
  }
};
