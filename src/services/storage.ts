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

export const isLocalImageDataUrl = (value?: string) => {
  return Boolean(value?.startsWith('data:image/'));
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
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
