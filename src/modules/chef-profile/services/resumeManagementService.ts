import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getMetadata, listAll, ref } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import { getStorageObjectPath, resolveStorageUrl } from '../../../services/storageReference';
import { buildManagedResumeRegistration, isOwnedResumeStoragePath, resumeFileNameFromObjectName, type ManagedChefResume, type ResumeFileUpload } from './resumeManagementModel';
import type { ImportedChefProfile } from '../types';
export type { ManagedChefResume, ResumeFileUpload, ResumeImportStatus, ResumeUploadResult } from './resumeManagementModel';

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)])
  );
  return value;
};

const assertOwnedPath = (userId: string, storagePath: string) => {
  const normalizedPath = getStorageObjectPath(storagePath, storage?.app.options.storageBucket);
  if (!normalizedPath || !isOwnedResumeStoragePath(userId, normalizedPath)) {
    throw new Error('This resume does not belong to the signed-in user.');
  }
  return normalizedPath;
};

const deleteFile = async (userId: string, storagePath: string) => {
  if (!storage || !storagePath) return;
  const normalizedPath = assertOwnedPath(userId, storagePath);
  try {
    await deleteObject(ref(storage, normalizedPath));
  } catch (error) {
    if ((error as { code?: string })?.code !== 'storage/object-not-found') throw error;
  }
};

const discoverLegacyResume = async (userId: string): Promise<ManagedChefResume | null> => {
  if (!storage) return null;
  const folder = ref(storage, `users/${userId}/chef-profile/resume-imports`);
  const listing = await listAll(folder);
  if (!listing.items.length) return null;
  const candidates = await Promise.all(listing.items.map(async item => ({
    item,
    metadata: await getMetadata(item)
  })));
  candidates.sort((left, right) => Date.parse(right.metadata.timeCreated) - Date.parse(left.metadata.timeCreated));
  const latest = candidates[0];
  const originalName = latest.metadata.customMetadata?.originalFileName;
  return {
    userId,
    fileName: originalName || resumeFileNameFromObjectName(latest.item.name),
    storagePath: latest.item.fullPath,
    contentType: latest.metadata.contentType || 'application/pdf',
    fileSize: latest.metadata.size,
    importStatus: 'review_required',
    uploadedAt: new Date(latest.metadata.timeCreated)
  };
};

export const resumeManagementService = {
  async load(userId: string): Promise<ManagedChefResume | null> {
    if (!db) return null;
    const snapshot = await getDoc(doc(db, 'chefResumeImports', userId));
    if (snapshot.exists()) return snapshot.data() as ManagedChefResume;
    const legacy = await discoverLegacyResume(userId);
    if (legacy) await setDoc(doc(db, 'chefResumeImports', userId), legacy).catch(() => undefined);
    return legacy;
  },

  async registerUpload(userId: string, result: ResumeFileUpload, previous?: ManagedChefResume | null) {
    if (!db) throw new Error('Resume management is temporarily unavailable.');
    assertOwnedPath(userId, result.originalStoragePath);
    const next = buildManagedResumeRegistration(userId, result, serverTimestamp());
    try {
      await setDoc(doc(db, 'chefResumeImports', userId), next);
    } catch (error) {
      await deleteFile(userId, result.originalStoragePath).catch(() => undefined);
      throw error;
    }

    if (previous?.storagePath && previous.storagePath !== result.originalStoragePath) {
      await deleteFile(userId, previous.storagePath).catch(() => undefined);
    }
    const { uploadedAt: _pendingServerTimestamp, ...registered } = next;
    return registered;
  },

  async saveDraft(userId: string, draft: ImportedChefProfile) {
    if (!db) throw new Error('Resume management is temporarily unavailable.');
    await updateDoc(doc(db, 'chefResumeImports', userId), {
      importStatus: 'review_required',
      draft: stripUndefined(draft),
      lastError: deleteField()
    });
  },

  async markFailed(userId: string, message: string) {
    if (!db) return;
    await updateDoc(doc(db, 'chefResumeImports', userId), {
      importStatus: 'failed',
      draft: deleteField(),
      lastError: message.trim().slice(0, 500)
    });
  },

  async markImported(userId: string) {
    if (!db) return;
    await updateDoc(doc(db, 'chefResumeImports', userId), {
      importStatus: 'imported',
      draft: deleteField(),
      lastError: deleteField(),
      importedAt: serverTimestamp()
    });
  },

  async discardDraft(userId: string) {
    if (!db) return;
    await updateDoc(doc(db, 'chefResumeImports', userId), {
      importStatus: 'review_required',
      draft: deleteField()
    });
  },

  async createViewUrl(userId: string, storagePath: string) {
    if (!storage) throw new Error('Resume viewing is temporarily unavailable.');
    const normalizedPath = assertOwnedPath(userId, storagePath);
    return resolveStorageUrl(storage, normalizedPath);
  },

  async delete(userId: string, resume: ManagedChefResume) {
    if (!db) throw new Error('Resume management is temporarily unavailable.');
    await deleteFile(userId, resume.storagePath);
    await deleteDoc(doc(db, 'chefResumeImports', userId));
  }
};
