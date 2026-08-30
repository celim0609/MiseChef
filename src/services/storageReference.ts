import { getDownloadURL, ref, type FirebaseStorage } from 'firebase/storage';

export type ParsedStorageReference =
  | { kind: 'empty' }
  | { kind: 'external'; url: string }
  | { kind: 'storage'; path: string; bucket?: string };

const normalizePath = (value: string) => decodeURIComponent(value)
  .replace(/^\/+/, '')
  .replace(/\/{2,}/g, '/');

const firebaseDownloadUrl = (url: URL): ParsedStorageReference | null => {
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;
  return { kind: 'storage', bucket: decodeURIComponent(match[1]), path: normalizePath(match[2]) };
};

const googleStorageDownloadUrl = (url: URL): ParsedStorageReference | null => {
  const match = url.pathname.match(/^\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
  if (!match) return null;
  return { kind: 'storage', bucket: decodeURIComponent(match[1]), path: normalizePath(match[2]) };
};

export const parseStorageReference = (value?: string | null): ParsedStorageReference => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return { kind: 'empty' };

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice(5);
    const separator = withoutScheme.indexOf('/');
    if (separator <= 0 || separator === withoutScheme.length - 1) {
      throw new Error('The saved Storage reference is invalid.');
    }
    return {
      kind: 'storage',
      bucket: withoutScheme.slice(0, separator),
      path: normalizePath(withoutScheme.slice(separator + 1))
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.hostname === 'firebasestorage.googleapis.com') {
      return firebaseDownloadUrl(url) || { kind: 'external', url: trimmed };
    }
    if (url.hostname === 'storage.googleapis.com') {
      return googleStorageDownloadUrl(url) || { kind: 'external', url: trimmed };
    }
    return { kind: 'external', url: trimmed };
  }

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return { kind: 'external', url: trimmed };
  }

  return { kind: 'storage', path: normalizePath(trimmed) };
};

export const getStorageObjectPath = (
  value: string,
  expectedBucket?: string
) => {
  const parsed = parseStorageReference(value);
  if (parsed.kind !== 'storage') return null;
  if (expectedBucket && parsed.bucket && parsed.bucket !== expectedBucket) {
    throw new Error(`The saved file belongs to a different Storage bucket (${parsed.bucket}).`);
  }
  if (!parsed.path || parsed.path.includes('..')) throw new Error('The saved Storage path is invalid.');
  return parsed.path;
};

export const getImmediateMediaUrl = (value?: string | null) => {
  const parsed = parseStorageReference(value);
  return parsed.kind === 'external' ? parsed.url : '';
};

export const selectResolvedMediaUrl = (
  storedValue?: string | null,
  resolvedUrl?: string | null,
  fallbackUrl?: string | null
) => resolvedUrl || getImmediateMediaUrl(storedValue) || fallbackUrl || '';

export const resolveStorageUrl = async (
  storage: FirebaseStorage,
  value?: string | null,
  downloadUrl: typeof getDownloadURL = getDownloadURL
) => {
  const parsed = parseStorageReference(value);
  if (parsed.kind === 'empty') return '';
  if (parsed.kind === 'external') return parsed.url;

  const configuredBucket = storage.app.options.storageBucket;
  if (parsed.bucket && configuredBucket && parsed.bucket !== configuredBucket) {
    throw new Error(`The saved file belongs to a different Storage bucket (${parsed.bucket}).`);
  }
  if (!parsed.path || parsed.path.includes('..')) throw new Error('The saved Storage path is invalid.');
  return downloadUrl(ref(storage, parsed.path));
};
