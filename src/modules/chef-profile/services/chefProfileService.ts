import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Portfolio } from '../../portfolio/types';
import { emptyChefProfile, migratePortfolio, sanitizeProfile } from '../model';
import type { ChefProfile } from '../types';

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)])
  );
  return value;
};

export const chefProfileService = {
  async load(userId: string, legacy?: Portfolio, workspaceId?: string, fallbackName = '', email = '') {
    if (!db) return legacy ? migratePortfolio(userId, legacy, fallbackName, email) : null;
    const snapshot = await getDoc(doc(db, 'chefProfiles', userId));
    if (snapshot.exists()) return snapshot.data() as ChefProfile;

    let legacyProfile = legacy;
    if (workspaceId) {
      const legacySnapshot = await getDoc(doc(db, 'workspaces', workspaceId, 'portfolio', 'profile'));
      if (legacySnapshot.exists()) legacyProfile = legacySnapshot.data() as Portfolio;
    }
    return legacyProfile ? migratePortfolio(userId, legacyProfile, fallbackName, email) : null;
  },

  async save(profile: ChefProfile) {
    const clean = sanitizeProfile(profile);
    if (!db) return clean;
    const reference = doc(db, 'chefProfiles', clean.userId);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(reference);
      const previousSlug = existing.exists() ? String(existing.data().profileSlug || '') : '';
      const nextSlug = clean.profileSlug || '';
      const nextSlugReference = nextSlug ? doc(db!, 'chefProfileSlugs', nextSlug) : null;
      const previousSlugReference = previousSlug && previousSlug !== nextSlug
        ? doc(db!, 'chefProfileSlugs', previousSlug)
        : null;
      const nextSlugSnapshot = nextSlugReference ? await transaction.get(nextSlugReference) : null;
      const previousSlugSnapshot = previousSlugReference ? await transaction.get(previousSlugReference) : null;

      if (nextSlugSnapshot?.exists() && nextSlugSnapshot.data().userId !== clean.userId) {
        throw new Error('This public profile URL is already in use.');
      }
      if (nextSlugReference && !nextSlugSnapshot?.exists()) {
        transaction.set(nextSlugReference, { userId: clean.userId });
      }
      if (previousSlugReference && previousSlugSnapshot?.data().userId === clean.userId) {
        transaction.delete(previousSlugReference);
      }
      transaction.set(reference, stripUndefined({
        ...clean,
        createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });
    return clean;
  },

  create(userId: string, name = '', email = '') {
    return emptyChefProfile(userId, name, email);
  }
};
