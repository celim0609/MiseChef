import type { WorkspaceStore } from '../types';

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

  if (typeof (left as { isEqual?: unknown }).isEqual === 'function') {
    return (left as { isEqual: (value: unknown) => boolean }).isEqual(right);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && valuesEqual(leftRecord[key], rightRecord[key]));
};

/**
 * Returns only fields intentionally changed by the Store Settings draft.
 *
 * `baseline` is the normalized Store used to render the form; `persisted` is
 * the raw Firestore document. Comparing both prevents UI-only normalization
 * (for example a legacy missing Curlec method) from becoming a write.
 */
export const buildStoreSettingsUpdate = (
  persisted: Record<string, unknown>,
  baseline: WorkspaceStore,
  updated: WorkspaceStore
): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  const candidate = updated as unknown as Record<string, unknown>;
  const baselineRecord = baseline as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(candidate)) {
    if (key === 'updatedAt' || valuesEqual(value, baselineRecord[key])) continue;
    if (!valuesEqual(value, persisted[key])) changes[key] = value;
  }

  if (Object.keys(changes).length > 0) changes.updatedAt = updated.updatedAt;
  return changes;
};
