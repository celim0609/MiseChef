/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const getStorageUploadErrorMessage = (
  error: unknown,
  itemName = 'Image'
) => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : '';

  switch (code) {
    case 'storage/unauthorized':
      return `${itemName} upload was blocked. Confirm you are the Store Owner or Manager, then try again.`;
    case 'storage/canceled':
      return `${itemName} upload was canceled.`;
    case 'storage/retry-limit-exceeded':
      return `${itemName} upload timed out. Check your connection and try again.`;
    case 'storage/invalid-checksum':
      return `${itemName} upload was interrupted. Please choose the file again and retry.`;
    default:
      return error instanceof Error
        ? `${itemName} upload failed. ${error.message}`
        : `${itemName} upload failed. Please try again.`;
  }
};
