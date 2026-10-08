import type { WorkspaceMemberRole } from '../../types';

// Matches the existing Firestore ingredient create/update roles. Entitlement is
// resolved by the app before mounting Costing; the server remains authoritative.
export const canEditIngredientLibrary = (role?: WorkspaceMemberRole | null) =>
  Boolean(role && ['Owner', 'Manager', 'Head Chef', 'Purchasing'].includes(role));
