import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { CostingIngredient } from '../types';

const normalizeIngredient = (ingredient: CostingIngredient): CostingIngredient => ({
  ...ingredient,
  conversionFactor: Number(ingredient.conversionFactor || 1),
  currentPrice: Number(ingredient.currentPrice || 0),
  yieldPercentage: Number(ingredient.yieldPercentage || 100),
  wastePercentage: Number(ingredient.wastePercentage || 0),
  status: ingredient.status || 'Active'
});

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

export const ingredientService = {
  async listIngredients(workspaceId?: string): Promise<CostingIngredient[]> {
    if (!db || !workspaceId) return [];

    const ingredientsQuery = query(collection(db, 'ingredients'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(ingredientsQuery);

    return snapshot.docs
      .map(ingredientDoc => normalizeIngredient({ id: ingredientDoc.id, ...ingredientDoc.data() } as CostingIngredient))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async createIngredient(
    ingredient: Omit<CostingIngredient, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'workspaceId'>,
    userId: string,
    workspaceId = userId
  ): Promise<CostingIngredient> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const ingredientRef = doc(collection(db, 'ingredients'));
    const now = new Date().toISOString();
    const nextIngredient: CostingIngredient = normalizeIngredient({
      ...ingredient,
      id: ingredientRef.id,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      workspaceId
    });

    await setDoc(ingredientRef, removeUndefinedFields(nextIngredient));
    return nextIngredient;
  },

  async updateIngredient(ingredient: CostingIngredient): Promise<CostingIngredient> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const nextIngredient = normalizeIngredient({
      ...ingredient,
      updatedAt: new Date().toISOString()
    });

    await updateDoc(doc(db, 'ingredients', ingredient.id), removeUndefinedFields(nextIngredient) as unknown as Record<string, unknown>);
    return nextIngredient;
  },

  async archiveIngredient(ingredient: CostingIngredient): Promise<CostingIngredient> {
    return this.updateIngredient({
      ...ingredient,
      status: 'Archived'
    });
  }
};
