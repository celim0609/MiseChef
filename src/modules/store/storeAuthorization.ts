import type { SubscriptionStatus, WorkspaceMemberRole } from '../../types';

export type StoreAuthorizationIssue =
  | 'authentication-mismatch'
  | 'membership-missing'
  | 'membership-inactive'
  | 'role-denied'
  | 'store-missing'
  | 'store-identity-mismatch'
  | 'product-identity-mismatch';

export class StoreAuthorizationError extends Error {
  readonly code: string;

  constructor(readonly issue: StoreAuthorizationIssue) {
    super(getStoreAuthorizationMessage(issue));
    this.name = 'StoreAuthorizationError';
    this.code = `store/${issue}`;
  }
}

export interface StoreAuthorizationContext {
  authenticatedUid: string;
  requestedUserId: string;
  workspaceId: string;
  workspaceOwnerId: string;
  membership: { role?: WorkspaceMemberRole; status?: string } | null;
  store: { id: string; workspaceId: string } | null;
  product?: { storeId: string; workspaceId: string } | null;
  subscriptionStatus?: SubscriptionStatus;
}

export const getStoreAuthorizationIssue = (
  context: StoreAuthorizationContext
): StoreAuthorizationIssue | null => {
  if (!context.authenticatedUid || context.authenticatedUid !== context.requestedUserId) {
    return 'authentication-mismatch';
  }
  if (!context.store) return 'store-missing';
  if (context.store.id !== context.workspaceId || context.store.workspaceId !== context.workspaceId) {
    return 'store-identity-mismatch';
  }
  if (context.product && (
    context.product.workspaceId !== context.workspaceId
    || context.product.storeId !== context.workspaceId
  )) return 'product-identity-mismatch';

  // workspaces.ownerId is the authoritative ownership record. Managers remain
  // membership-based and must be Active.
  if (context.workspaceOwnerId === context.authenticatedUid) return null;
  if (!context.membership) return 'membership-missing';
  if (context.membership.status !== 'Active') return 'membership-inactive';
  if (context.membership.role !== 'Owner' && context.membership.role !== 'Manager') return 'role-denied';
  return null;
};

export const getStoreAuthorizationMessage = (issue: StoreAuthorizationIssue) => {
  switch (issue) {
    case 'authentication-mismatch':
      return 'Your sign-in changed while this product was open. Refresh the page and try again.';
    case 'membership-missing':
      return 'Your Workspace membership is missing. Ask the Workspace Owner to restore your Store access.';
    case 'membership-inactive':
      return 'Your Workspace membership is not active. Ask the Workspace Owner to restore your Store access.';
    case 'role-denied':
      return 'Only the Workspace Owner or a Manager can manage Store products.';
    case 'store-missing':
      return 'This Workspace does not have a Store yet. Return to Store Settings and create it first.';
    case 'store-identity-mismatch':
      return 'This Store has stale Workspace information and cannot be saved safely. Contact MiseChef support to repair it.';
    case 'product-identity-mismatch':
      return 'This product belongs to stale or mismatched Store data and cannot be saved safely. Contact MiseChef support to repair it.';
  }
};
