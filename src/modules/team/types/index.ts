import type { WorkspaceMemberRole, WorkspaceMemberStatus } from '../../../types';

export type TeamRoleName = WorkspaceMemberRole;
export type { WorkspaceMemberRole, WorkspaceMemberStatus };

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  displayName: string;
  email: string;
  role: TeamRoleName;
  status: WorkspaceMemberStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  invitedAt?: string;
  joinedAt?: string;
  disabledAt?: string;
  removedAt?: string;
  invitationId?: string;
}

export interface TeamInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: TeamRoleName;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Cancelled';
  invitedBy: string;
  invitedByEmail: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
  declinedAt?: string;
  declinedBy?: string;
}

export interface TeamRole {
  id: string;
  workspaceId: string;
  name: TeamRoleName;
  description: string;
  permissions: string[];
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamData {
  workspace: Workspace | null;
  members: WorkspaceMember[];
  roles: TeamRole[];
  invitations: TeamInvitation[];
  pendingInvitations: TeamInvitation[];
}
