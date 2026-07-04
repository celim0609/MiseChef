import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { TeamData, TeamRole, TeamRoleName, Workspace, WorkspaceMember } from '../types';

const DEFAULT_ROLE_DEFINITIONS: Array<{ name: TeamRoleName; description: string }> = [
  { name: 'Owner', description: 'Full workspace ownership and administration.' },
  { name: 'Manager', description: 'Restaurant operations and team management.' },
  { name: 'Head Chef', description: 'Kitchen leadership and recipe oversight.' },
  { name: 'Sous Chef', description: 'Kitchen operations support and production leadership.' },
  { name: 'Chef', description: 'Recipe, prep, and production team access.' },
  { name: 'Purchasing', description: 'Supplier, invoice, and ingredient purchasing access.' },
  { name: 'Finance', description: 'Sales, purchases, and reporting access.' },
  { name: 'Viewer', description: 'Read-only workspace visibility.' }
];

const toRoleId = (workspaceId: string, roleName: TeamRoleName) =>
  `${workspaceId}_${roleName.toLowerCase().replace(/\s+/g, '-')}`;

const nowIso = () => new Date().toISOString();

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => removeUndefinedFields(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) {
        acc[key] = removeUndefinedFields(item);
      }
      return acc;
    }, {}) as T;
  }

  return value;
};

const getWorkspaceForUser = async (userId: string) => {
  if (!db) return null;

  const workspaceQuery = query(collection(db, 'workspaces'), where('ownerId', '==', userId));
  const snapshot = await getDocs(workspaceQuery);
  const workspaceDoc = snapshot.docs[0];

  if (!workspaceDoc) return null;

  return {
    id: workspaceDoc.id,
    ...workspaceDoc.data()
  } as Workspace;
};

const createWorkspaceForUser = async (userId: string, displayName?: string | null) => {
  if (!db) return null;

  const createdAt = nowIso();
  const workspaceRef = doc(collection(db, 'workspaces'));
  const workspace: Workspace = {
    id: workspaceRef.id,
    name: `${displayName || 'My'} Workspace`,
    ownerId: userId,
    createdBy: userId,
    createdAt,
    updatedAt: createdAt
  };

  await setDoc(workspaceRef, workspace);
  return workspace;
};

const ensureWorkspace = async (userId: string, displayName?: string | null) => {
  const existingWorkspace = await getWorkspaceForUser(userId);
  return existingWorkspace || createWorkspaceForUser(userId, displayName);
};

const ensureDefaultRoles = async (workspace: Workspace, userId: string) => {
  if (!db) return [];

  const createdAt = nowIso();
  const roles = DEFAULT_ROLE_DEFINITIONS.map(roleDefinition => ({
    id: toRoleId(workspace.id, roleDefinition.name),
    workspaceId: workspace.id,
    name: roleDefinition.name,
    description: roleDefinition.description,
    permissions: [],
    isDefault: true,
    createdBy: userId,
    createdAt,
    updatedAt: createdAt
  }));

  await Promise.all(
    roles.map(role =>
      setDoc(doc(db, 'roles', role.id), removeUndefinedFields(role), { merge: true })
    )
  );

  return roles;
};

const ensureOwnerMember = async (
  workspace: Workspace,
  userId: string,
  email?: string | null,
  displayName?: string | null
) => {
  if (!db) return null;

  const createdAt = nowIso();
  const ownerMember: WorkspaceMember = {
    id: `${workspace.id}_${userId}`,
    workspaceId: workspace.id,
    userId,
    displayName: displayName || email?.split('@')[0] || 'Workspace Owner',
    email: email || '',
    role: 'Owner',
    status: 'Active',
    createdBy: userId,
    createdAt,
    updatedAt: createdAt,
    joinedAt: createdAt
  };

  await setDoc(doc(db, 'workspaceMembers', ownerMember.id), removeUndefinedFields(ownerMember), { merge: true });
  return ownerMember;
};

const loadWorkspaceMembers = async (workspaceId: string) => {
  if (!db) return [];

  const membersQuery = query(collection(db, 'workspaceMembers'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(membersQuery);

  return snapshot.docs
    .map(memberDoc => ({ id: memberDoc.id, ...memberDoc.data() } as WorkspaceMember))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const loadWorkspaceRoles = async (workspaceId: string) => {
  if (!db) return [];

  const rolesQuery = query(collection(db, 'roles'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(rolesQuery);

  return snapshot.docs
    .map(roleDoc => ({ id: roleDoc.id, ...roleDoc.data() } as TeamRole))
    .sort((a, b) => DEFAULT_ROLE_DEFINITIONS.findIndex(role => role.name === a.name)
      - DEFAULT_ROLE_DEFINITIONS.findIndex(role => role.name === b.name));
};

export const teamService = {
  getDefaultRoles() {
    return DEFAULT_ROLE_DEFINITIONS;
  },

  async loadTeam(userId?: string, email?: string | null, displayName?: string | null): Promise<TeamData> {
    if (!db || !userId) {
      return { workspace: null, members: [], roles: [] };
    }

    const workspace = await ensureWorkspace(userId, displayName);
    if (!workspace) {
      return { workspace: null, members: [], roles: [] };
    }

    await ensureDefaultRoles(workspace, userId);
    await ensureOwnerMember(workspace, userId, email, displayName);

    const [members, roles] = await Promise.all([
      loadWorkspaceMembers(workspace.id),
      loadWorkspaceRoles(workspace.id)
    ]);

    return { workspace, members, roles };
  },

  async disableMember(member: WorkspaceMember) {
    if (!db || member.role === 'Owner') return;

    const updatedAt = nowIso();
    await updateDoc(doc(db, 'workspaceMembers', member.id), {
      status: 'Disabled',
      disabledAt: updatedAt,
      updatedAt
    });
  },

  async removeMember(member: WorkspaceMember) {
    if (!db || member.role === 'Owner') return;

    const updatedAt = nowIso();
    await updateDoc(doc(db, 'workspaceMembers', member.id), {
      status: 'Removed',
      removedAt: updatedAt,
      updatedAt
    });
  }
};

