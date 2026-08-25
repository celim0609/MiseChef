import type { Recipe, WorkspaceMemberSummary } from '../types';

export const preserveOriginalRecipeCreator = (
  original: Recipe,
  edited: Recipe
): Recipe => ({
  ...edited,
  id: original.id,
  workspaceId: original.workspaceId,
  companyId: original.companyId,
  userId: original.userId,
  createdBy: original.createdBy,
  createdByName: original.createdByName,
  createdAt: original.createdAt
});

export const getRecipeCreatorName = (
  recipe: Recipe,
  members: WorkspaceMemberSummary[] = []
) => {
  const storedName = recipe.createdByName?.trim();
  if (storedName) return storedName;

  const creatorId = recipe.createdBy || recipe.userId;
  const member = members.find(candidate => candidate.userId === creatorId);
  const memberName = member?.displayName.trim();
  if (memberName) return memberName;

  const emailName = member?.email.split('@')[0]?.trim();
  return emailName || 'Unknown member';
};

export const formatRecipeCreatorLine = (
  recipe: Recipe,
  members: WorkspaceMemberSummary[] = []
) => {
  const creator = getRecipeCreatorName(recipe, members);
  if (!recipe.createdAt) return `Created by ${creator}`;

  const createdAt = new Date(recipe.createdAt);
  if (Number.isNaN(createdAt.getTime())) return `Created by ${creator}`;

  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur'
  }).format(createdAt);
  return `Created by ${creator} · ${date}`;
};
