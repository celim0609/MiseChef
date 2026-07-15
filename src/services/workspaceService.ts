import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import type { Workspace, WorkspaceMembership, WorkspaceMemberRole, WorkspaceMemberSummary } from '../types';
import { normalizeTeamRole } from '../modules/team/permissions';

const WORKSPACE_SELECTION_STORAGE_KEY = 'misechef_selected_workspace_id';

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

const getDefaultWorkspaceName = (user: User) => {
  const displayName = user.displayName?.trim();
  if (displayName) return `${displayName} Kitchen`;
  const emailName = user.email?.split('@')[0]?.trim();
  return emailName ? `${emailName} Kitchen` : 'My Kitchen';
};

const toMemberSummary = (user: User, role: WorkspaceMemberSummary['role']): WorkspaceMemberSummary => ({
  userId: user.uid,
  email: user.email || '',
  displayName: user.displayName || user.email?.split('@')[0] || 'User',
  role,
  status: 'Active'
});

const normalizeWorkspace = (id: string, data: Partial<Workspace> | Record<string, unknown>): Workspace => ({
  id,
  name: typeof data.name === 'string' && data.name.trim() ? data.name : id,
  ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
  members: Array.isArray(data.members) ? data.members as WorkspaceMemberSummary[] : [],
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
});

const normalizeMembership = (id: string, data: Partial<WorkspaceMembership> | Record<string, unknown>): WorkspaceMembership => ({
  id,
  workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : '',
  userId: typeof data.userId === 'string' ? data.userId : '',
  email: typeof data.email === 'string' ? data.email : '',
  displayName: typeof data.displayName === 'string' ? data.displayName : '',
  role: normalizeTeamRole(data.role) as WorkspaceMemberRole,
  status: data.status === 'Disabled' || data.status === 'Invited' || data.status === 'Removed' ? data.status : 'Active',
  workspaceName: typeof data.workspaceName === 'string' ? data.workspaceName : '',
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
});

const createWorkspaceMembership = async ({
  workspace,
  user,
  role = 'Owner'
}: {
  workspace: Workspace;
  user: User;
  role?: WorkspaceMemberSummary['role'];
}) => {
  if (!db) return;

  const now = new Date().toISOString();
  const membershipId = `${workspace.id}_${user.uid}`;
  const membership: WorkspaceMembership = {
    id: membershipId,
    workspaceId: workspace.id,
    userId: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    role,
    status: 'Active',
    workspaceName: workspace.name,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(db, 'workspaceMembers', membershipId), removeUndefinedFields(membership), { merge: true });
};

const upsertWorkspace = async ({
  id,
  name,
  ownerId,
  user,
  role = 'Owner'
}: {
  id: string;
  name: string;
  ownerId: string;
  user: User;
  role?: WorkspaceMemberSummary['role'];
}) => {
  if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

  const workspaceRef = doc(db, 'workspaces', id);
  const snapshot = await getDoc(workspaceRef);
  const existing = snapshot.exists() ? normalizeWorkspace(snapshot.id, snapshot.data()) : null;
  const now = new Date().toISOString();
  const member = toMemberSummary(user, role);
  const members = existing?.members?.some(item => item.userId === user.uid)
    ? existing.members.map(item => item.userId === user.uid ? { ...item, ...member } : item)
    : [...(existing?.members || []), member];
  const workspace: Workspace = {
    id,
    name: existing?.name || name,
    ownerId: existing?.ownerId || ownerId,
    members,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await setDoc(workspaceRef, removeUndefinedFields(workspace), { merge: true });
  await createWorkspaceMembership({ workspace, user, role });
  return workspace;
};

export const workspaceService = {
  storageKey: WORKSPACE_SELECTION_STORAGE_KEY,

  getStoredWorkspaceId(userId: string) {
    return localStorage.getItem(`${WORKSPACE_SELECTION_STORAGE_KEY}_${userId}`) || '';
  },

  setStoredWorkspaceId(userId: string, workspaceId: string) {
    localStorage.setItem(`${WORKSPACE_SELECTION_STORAGE_KEY}_${userId}`, workspaceId);
  },

  async ensurePrimaryWorkspace(user: User) {
    return upsertWorkspace({
      id: user.uid,
      name: getDefaultWorkspaceName(user),
      ownerId: user.uid,
      user,
      role: 'Owner'
    });
  },

  async listAccessibleWorkspaces(user: User): Promise<Workspace[]> {
    if (!db) return [];

    const membershipsQuery = query(
      collection(db, 'workspaceMembers'),
      where('userId', '==', user.uid)
    );
    const membershipsSnapshot = await getDocs(membershipsQuery);
    const activeMemberships = membershipsSnapshot.docs
      .map(memberDoc => normalizeMembership(memberDoc.id, memberDoc.data()))
      .filter(membership => membership.status === 'Active' && membership.workspaceId);

    const canonicalMemberships = Array.from(
      activeMemberships.reduce<Map<string, WorkspaceMembership>>((acc, membership) => {
        const existingMembership = acc.get(membership.workspaceId);
        const canonicalId = `${membership.workspaceId}_${user.uid}`;
        const shouldReplace = !existingMembership
          || membership.id === canonicalId
          || (existingMembership.id !== canonicalId && membership.updatedAt > existingMembership.updatedAt);

        if (shouldReplace) acc.set(membership.workspaceId, membership);
        return acc;
      }, new Map()).values()
    );

    const workspaceSnapshots = (await Promise.all(
      canonicalMemberships.map(membership =>
        getDoc(doc(db, 'workspaces', membership.workspaceId)).catch(() => null)
      )
    )).filter(snapshot => snapshot !== null);

    const dedupedWorkspaces = Array.from(
      workspaceSnapshots
        .filter(snapshot => snapshot.exists())
        .map(snapshot => normalizeWorkspace(snapshot.id, snapshot.data()))
        .reduce<Map<string, Workspace>>((acc, workspace) => {
          acc.set(workspace.id, workspace);
          return acc;
        }, new Map()).values()
    );

    const hasCanonicalPersonalWorkspace = dedupedWorkspaces.some(workspace => workspace.id === user.uid);
    const duplicatePersonalWorkspaceIds = hasCanonicalPersonalWorkspace
      ? dedupedWorkspaces
        .filter(workspace => workspace.ownerId === user.uid && workspace.id !== user.uid)
        .map(workspace => workspace.id)
      : [];

    const displayWorkspaces = dedupedWorkspaces
      .filter(workspace => !duplicatePersonalWorkspaceIds.includes(workspace.id))
      .map(workspace => {
        const membership = canonicalMemberships.find(item => item.workspaceId === workspace.id);
        if (!membership) return workspace;

        const currentMember: WorkspaceMemberSummary = {
          userId: membership.userId,
          email: membership.email,
          displayName: membership.displayName,
          role: membership.role,
          status: membership.status
        };
        const members = workspace.members.some(member => member.userId === membership.userId)
          ? workspace.members.map(member => member.userId === membership.userId ? currentMember : member)
          : [...workspace.members, currentMember];

        return { ...workspace, members };
      });

    const workspaceRank = (workspace: Workspace) => {
      if (workspace.id === workspace.ownerId) return 1;
      return 2;
    };

    const workspaces = displayWorkspaces
      .sort((a, b) => workspaceRank(a) - workspaceRank(b) || a.name.localeCompare(b.name));

    return workspaces;
  },

  async listUserWorkspaces(user: User): Promise<Workspace[]> {
    const accessibleWorkspaces = await this.listAccessibleWorkspaces(user);
    if (accessibleWorkspaces.length > 0) return accessibleWorkspaces;

    await this.ensurePrimaryWorkspace(user);
    return this.listAccessibleWorkspaces(user);
  },

  resolveSelectedWorkspace(user: User, workspaces: Workspace[]) {
    const storedWorkspaceId = this.getStoredWorkspaceId(user.uid);
    return workspaces.find(workspace => workspace.id === storedWorkspaceId)
      || workspaces.find(workspace => workspace.id === user.uid)
      || workspaces[0]
      || null;
  }
};
