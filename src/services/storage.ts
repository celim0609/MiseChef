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

const getPortfolioHeroBackgroundPath = (userId: string, extension: string) => {
  return `users/${userId}/portfolio/cover/hero-background.${extension}`;
};

const getPortfolioGalleryImagePath = (userId: string, galleryItemId: string, extension: string) => {
  return `users/${userId}/portfolio/gallery/${galleryItemId}.${extension}`;
};

const getPortfolioCertificatePdfPath = (userId: string, certificateId: string) => {
  return `users/${userId}/portfolio/certificates/${certificateId}/certificate.pdf`;
};

const getPortfolioCertificateThumbnailPath = (userId: string, certificateId: string, extension: string) => {
  return `users/${userId}/portfolio/certificates/${certificateId}/thumbnail.${extension}`;
};

const getPortfolioResumePath = (userId: string) => {
  return `users/${userId}/portfolio/resume/resume.pdf`;
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

const getSupportedImageExtension = (file: File) => {
  switch (file.type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
};

const uploadFile = async ({
  path,
  file,
  cacheControl,
  onProgress,
}: {
  path: string;
  file: File;
  cacheControl: string;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
  }

  const fileRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: file.type,
    cacheControl,
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
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
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
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
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
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
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
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
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

export const uploadPortfolioHeroBackground = async ({
  userId,
  file,
  onProgress,
}: {
  userId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  const extension = getSupportedImageExtension(file);
  if (!extension) {
    throw new Error('Cover image must be a JPG, PNG, or WEBP file.');
  }

  return uploadFile({
    path: getPortfolioHeroBackgroundPath(userId, extension),
    file,
    cacheControl: 'public,max-age=31536000',
    onProgress,
  });
};

export const uploadPortfolioGalleryImage = async ({
  userId,
  galleryItemId,
  file,
  onProgress,
}: {
  userId: string;
  galleryItemId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  const extension = getSupportedImageExtension(file);
  if (!extension) {
    throw new Error('Gallery image must be a JPG, PNG, or WEBP file.');
  }

  return uploadFile({
    path: getPortfolioGalleryImagePath(userId, galleryItemId, extension),
    file,
    cacheControl: 'public,max-age=31536000',
    onProgress,
  });
};

export const uploadPortfolioCertificatePdf = async ({
  userId,
  certificateId,
  file,
  onProgress,
}: {
  userId: string;
  certificateId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  if (file.type !== 'application/pdf') {
    throw new Error('Certificate file must be a PDF.');
  }

  return uploadFile({
    path: getPortfolioCertificatePdfPath(userId, certificateId),
    file,
    cacheControl: 'private,max-age=31536000',
    onProgress,
  });
};

export const uploadPortfolioCertificateThumbnail = async ({
  userId,
  certificateId,
  file,
  onProgress,
}: {
  userId: string;
  certificateId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  const extension = getSupportedImageExtension(file);
  if (!extension) {
    throw new Error('Certificate thumbnail must be a JPG, PNG, or WEBP file.');
  }

  return uploadFile({
    path: getPortfolioCertificateThumbnailPath(userId, certificateId, extension),
    file,
    cacheControl: 'public,max-age=31536000',
    onProgress,
  });
};

export const uploadPortfolioResume = async ({
  userId,
  file,
  onProgress,
}: {
  userId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  if (file.type !== 'application/pdf') {
    throw new Error('Resume file must be a PDF.');
  }

  return uploadFile({
    path: getPortfolioResumePath(userId),
    file,
    cacheControl: 'private,max-age=31536000',
    onProgress,
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
