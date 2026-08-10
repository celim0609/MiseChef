import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeOnboarding, type OnboardingGoal, type UserOnboarding } from './onboardingModel';

export const onboardingService = {
  async load(userId: string): Promise<UserOnboarding> {
    if (!db) return normalizeOnboarding(null);
    const snapshot = await getDoc(doc(db, 'users', userId));
    return normalizeOnboarding(snapshot.exists() ? snapshot.data().onboarding : null);
  },

  async complete(userId: string, goals: OnboardingGoal[]): Promise<UserOnboarding> {
    if (!db) throw new Error("We couldn't save your choices. Please try again.");
    const now = new Date().toISOString();
    const onboarding: UserOnboarding = {
      version: 1,
      status: goals.length ? 'completed' : 'skipped',
      goals: [...new Set(goals)],
      createdAt: now,
      updatedAt: now,
      completedAt: now
    };
    await setDoc(doc(db, 'users', userId), { onboarding }, { merge: true });
    return onboarding;
  }
};
