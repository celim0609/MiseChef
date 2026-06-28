/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FirebaseError } from 'firebase/app';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase';

export const getRecipeCoverPath = (userId: string, recipeId: string) => {
  return `recipes/${userId}/${recipeId}/cover.jpg`;
};

export const getRecipeScanAttachmentPath = (userId: string, recipeId: string) => {
  return `recipes/${userId}/${recipeId}/scan.jpg`;
};

export const getRecipeStepImagePath = (userId: string, recipeId: string, stepId: string) => {
  return `recipes/${userId}/${recipeId}/steps/${stepId}.jpg`;
};

export const getUserProfilePhotoPath = (userId: string) => {
  return `users/${userId}/profile/avatar.jpg`;
};

export const isLocalImageDataUrl = (value?: string) => {
  return Boolean(value?.startsWith('data:image/'));
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getDataUrlMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] || 'image/jpeg';
};

export const uploadRecipeCoverImage = async ({
  userId,
  recipeId,
  imageDataUrl,
  onProgress,
}: {
  userId: string;
  recipeId: string;
  imageDataUrl: string;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const imageBlob = await dataUrlToBlob(imageDataUrl);
  const coverRef = ref(storage, getRecipeCoverPath(userId, recipeId));
  const uploadTask = uploadBytesResumable(coverRef, imageBlob, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const uploadRecipeScanAttachment = async ({
  userId,
  recipeId,
  imageDataUrl,
  onProgress,
}: {
  userId: string;
  recipeId: string;
  imageDataUrl: string;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const imageBlob = await dataUrlToBlob(imageDataUrl);
  const scanRef = ref(storage, getRecipeScanAttachmentPath(userId, recipeId));
  const uploadTask = uploadBytesResumable(scanRef, imageBlob, {
    contentType: getDataUrlMimeType(imageDataUrl),
    cacheControl: 'private,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const uploadRecipeStepImage = async ({
  userId,
  recipeId,
  stepId,
  imageDataUrl,
  onProgress,
}: {
  userId: string;
  recipeId: string;
  stepId: string;
  imageDataUrl: string;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const imageBlob = await dataUrlToBlob(imageDataUrl);
  const stepImageRef = ref(storage, getRecipeStepImagePath(userId, recipeId, stepId));
  const uploadTask = uploadBytesResumable(stepImageRef, imageBlob, {
    contentType: getDataUrlMimeType(imageDataUrl),
    cacheControl: 'public,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const uploadUserProfilePhoto = async ({
  userId,
  imageDataUrl,
}: {
  userId: string;
  imageDataUrl: string;
}) => {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const imageBlob = await dataUrlToBlob(imageDataUrl);
  const avatarRef = ref(storage, getUserProfilePhotoPath(userId));
  const uploadTask = uploadBytesResumable(avatarRef, imageBlob, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      undefined,
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const deleteRecipeCoverImage = async (userId: string, recipeId: string) => {
  if (!storage) return;

  try {
    await deleteObject(ref(storage, getRecipeCoverPath(userId, recipeId)));
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'storage/object-not-found') {
      return;
    }

    throw err;
  }
};

export const deleteRecipeScanAttachment = async (userId: string, recipeId: string) => {
  if (!storage) return;

  try {
    await deleteObject(ref(storage, getRecipeScanAttachmentPath(userId, recipeId)));
  } catch (err) {
    if (err instanceof FirebaseError && err.code === 'storage/object-not-found') {
      return;
    }

    throw err;
  }
};
