import type { Recipe } from '../types';

export type RecipeSaveStage = 'prepare' | 'usage-limit' | 'upload' | 'costing' | 'firestore' | 'dependents';
type RecipeIdentity = Partial<Recipe> & { creatorId?: unknown };
const identityFields = ['creatorId', 'createdBy', 'createdByName', 'createdAt', 'userId', 'workspaceId', 'companyId'] as const;

export const getRecipeSaveDiagnostic = ({
  recipe, originalRecipe, workspaceId, memberRole, memberStatus, error, stage, operation
}: {
  recipe: RecipeIdentity;
  originalRecipe?: RecipeIdentity | null;
  workspaceId: string;
  memberRole: string | null;
  memberStatus: string | null;
  error: unknown;
  stage: RecipeSaveStage;
  operation: 'create' | 'update';
}) => {
  const firebaseError = error as { code?: unknown; message?: unknown } | null;
  // Explicit allowlist: never spread a Recipe, membership document, or error object.
  return {
    recipeDocumentId: recipe.id || null,
    workspaceId,
    recipeWorkspaceId: recipe.workspaceId || null,
    memberRole,
    memberStatus,
    operation,
    stage,
    identityFieldsChanged: originalRecipe
      // Saves merge into the existing document; omitted fields stay unchanged.
      ? Object.fromEntries(identityFields.map(field => [field, recipe[field] !== undefined && recipe[field] !== originalRecipe[field]]))
      : null,
    code: typeof firebaseError?.code === 'string' ? firebaseError.code : null,
    message: typeof firebaseError?.message === 'string' ? firebaseError.message : 'Unknown Recipe save error'
  };
};
