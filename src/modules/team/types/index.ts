export type TeamRoleName =
  | 'Owner'
  | 'Manager'
  | 'Head Chef'
  | 'Sous Chef'
  | 'Chef'
  | 'Purchasing'
  | 'Finance'
  | 'Viewer';

export type WorkspaceMemberStatus = 'Active' | 'Invited' | 'Disabled' | 'Removed';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdBy: string;
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
}

