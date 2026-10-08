import type { WorkspaceMemberRole } from '../types';

export type WorkspaceAccessState = 'loading' | 'allowed' | 'denied' | 'error';

export const resolveWorkspaceAccess = (
  workspaceId: string | undefined,
  role: WorkspaceMemberRole | null,
  entitlement: { workspaceId: string; allowed: boolean; error?: boolean } | null,
  workspaceStatus: 'loading' | 'ready' | 'error' = 'ready'
): WorkspaceAccessState => {
  if (workspaceStatus === 'loading') return 'loading';
  if (workspaceStatus === 'error') return 'error';
  if (!workspaceId && workspaceStatus === 'ready') return 'denied';
  if (!workspaceId || !role || !entitlement || entitlement.workspaceId !== workspaceId) return 'loading';
  if (entitlement.error) return 'error';
  return entitlement.allowed ? 'allowed' : 'denied';
};
