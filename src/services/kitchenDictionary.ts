/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ingredients from '../data/dictionary/ingredients.json';
import { KitchenDictionaryIngredient, UserRole } from '../types';
import { isAdminRole } from '../utils/userRoles';

const normalizeDictionaryEntry = (entry: KitchenDictionaryIngredient): KitchenDictionaryIngredient => ({
  chinese: entry.chinese.trim(),
  english: entry.english.trim(),
  category: entry.category.trim(),
  aliases: Array.isArray(entry.aliases)
    ? entry.aliases.map(alias => alias.trim()).filter(Boolean)
    : []
});

const KITCHEN_DICTIONARY_INGREDIENTS = (ingredients as KitchenDictionaryIngredient[])
  .map(normalizeDictionaryEntry)
  .filter(entry => entry.chinese && entry.english);

const normalizeDictionaryKey = (value: string) => value.trim().toLowerCase();

const KITCHEN_DICTIONARY_LOOKUP = KITCHEN_DICTIONARY_INGREDIENTS.reduce<Record<string, KitchenDictionaryIngredient>>((acc, entry) => {
  [
    entry.chinese,
    entry.english,
    `${entry.english} (${entry.chinese})`,
    ...entry.aliases
  ].forEach(value => {
    const key = normalizeDictionaryKey(value);
    if (key) acc[key] = entry;
  });

  return acc;
}, {});

const getKitchenDictionaryLookupCandidates = (name: string) => {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const candidates = new Set<string>([trimmed]);
  const bilingualMatch = trimmed.match(/^(.+?)\s*\((.+)\)$/);

  if (bilingualMatch) {
    candidates.add(bilingualMatch[1].trim());
    candidates.add(bilingualMatch[2].trim());
  }

  trimmed
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(part => candidates.add(part));

  return Array.from(candidates);
};

export const findKitchenDictionaryIngredientByName = (name: string) => {
  for (const candidate of getKitchenDictionaryLookupCandidates(name)) {
    const entry = KITCHEN_DICTIONARY_LOOKUP[normalizeDictionaryKey(candidate)];
    if (entry) return entry;
  }

  return null;
};

export const normalizeKitchenDictionaryIngredientName = (name: string) => {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return {
      name: '',
      englishName: '',
      chineseName: ''
    };
  }

  const entry = findKitchenDictionaryIngredientByName(trimmed);
  if (!entry) {
    return {
      name: trimmed,
      englishName: trimmed,
      chineseName: trimmed
    };
  }

  return {
    name: `${entry.english} (${entry.chinese})`,
    englishName: entry.english,
    chineseName: entry.chinese
  };
};

export const canReadKitchenDictionary = () => true;

export const canCreateKitchenDictionaryEntry = (role: UserRole) => isAdminRole(role);

export const canUpdateKitchenDictionaryEntry = (role: UserRole) => isAdminRole(role);

export const canDeleteKitchenDictionaryEntry = (role: UserRole) => isAdminRole(role);

export const isKnownKitchenDictionaryIngredientName = (name: string) => {
  return Boolean(findKitchenDictionaryIngredientByName(name));
};

export const getKitchenDictionaryIngredients = (): KitchenDictionaryIngredient[] => {
  if (!canReadKitchenDictionary()) return [];
  return KITCHEN_DICTIONARY_INGREDIENTS.map(entry => ({
    ...entry,
    aliases: [...entry.aliases]
  }));
};

export const getKitchenDictionaryCategories = (): string[] => {
  if (!canReadKitchenDictionary()) return [];

  return Array.from(new Set(
    KITCHEN_DICTIONARY_INGREDIENTS
      .map(entry => entry.category)
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
};
