import { addDoc, collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { auditLogService } from '../../../services/auditLogService';
import type { WorkspaceMemberRole, WorkspaceMemberSummary } from '../../../types';
import { TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_ORDER, normalizeTeamRole } from '../permissions';
import type { TeamData, TeamInvitation, TeamRole, TeamRoleName, Workspace, WorkspaceMember } from '../types';

const toRoleId = (workspaceId: string, roleName: TeamRoleName) =>
  `${workspaceId}_${roleName.toLowerCase().replace(/\s+/g, '-')}`;

const nowIso = () => new Date().toISOString();

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

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const normalizeWorkspace = (id: string, data: Record<string, unknown>): Workspace => ({
  id,
  name: readString(data.name, 'Workspace'),
  ownerId: readString(data.ownerId),
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, nowIso()),
  updatedAt: readString(data.updatedAt, nowIso())
});

const normalizeMember = (id: string, data: Record<string, unknown>): WorkspaceMember => ({
  id,
  workspaceId: readString(data.workspaceId),
  userId: readString(data.userId),
  displayName: readString(data.displayName, readString(data.email, 'Member')),
  email: readString(data.email),
  role: normalizeTeamRole(data.role),
  status: data.status === 'Disabled' || data.status === 'Invited' || data.status === 'Removed' ? data.status : 'Active',
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt, nowIso()),
  updatedAt: readString(data.updatedAt, nowIso()),
  invitedAt: readString(data.invitedAt) || undefined,
  joinedAt: readString(data.joinedAt) || undefined,
  disabledAt: readString(data.disabledAt) || undefined,
  removedAt: readString(data.removedAt) || undefined
});

const normalizeInvitation = (id: string, data: Record<string, unknown>): TeamInvitation => ({
  id,
  workspaceId: readString(data.workspaceId),
  workspaceName: readString(data.workspaceName),
  email: readString(data.email).toLowerCase(),
  role: normalizeTeamRole(data.role),
  status: data.status === 'Accepted' || data.status === 'Declined' || data.status === 'Cancelled' ? data.status : 'Pending',
  invitedBy: readString(data.invitedBy),
  invitedByEmail: readString(data.invitedByEmail),
  createdAt: readString(data.createdAt, nowIso()),
  updatedAt: readString(data.updatedAt, nowIso()),
  acceptedAt: readString(data.acceptedAt) || undefined,
  acceptedBy: readString(data.acceptedBy) || undefined,
  declinedAt: readString(data.declinedAt) || undefined,
  declinedBy: readString(data.declinedBy) || undefined
});

const toMemberSummary = (member: WorkspaceMember): WorkspaceMemberSummary => ({
  userId: member.userId,
  email: member.email,
  displayName: member.displayName,
  role: member.role,
  status: member.status
});

const getWorkspace = async (workspaceId: string) => {
  if (!db || !workspaceId) return null;
  const workspaceSnapshot = await getDoc(doc(db, 'workspaces', workspaceId));
  return workspaceSnapshot.exists() ? normalizeWorkspace(workspaceSnapshot.id, workspaceSnapshot.data() as Record<string, unknown>) : null;
};

const ensureDefaultRoles = async (workspace: Workspace, userId: string) => {
  if (!db) return [];

  const createdAt = nowIso();
  const roles = TEAM_ROLE_ORDER.map(roleName => ({
    id: toRoleId(workspace.id, roleName),
    workspaceId: workspace.id,
    name: roleName,
    description: TEAM_ROLE_DESCRIPTIONS[roleName],
    permissions: [],
    isDefault: true,
    createdBy: userId,
    createdAt,
    updatedAt: createdAt
  } satisfies TeamRole));

  await Promise.all(
    roles.map(role => setDoc(doc(db, 'roles', role.id), removeUndefinedFields(role), { merge: true }))
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

  const memberId = `${workspace.id}_${userId}`;
  const memberSnapshot = await getDoc(doc(db, 'workspaceMembers', memberId));
  if (memberSnapshot.exists()) return normalizeMember(memberSnapshot.id, memberSnapshot.data() as Record<string, unknown>);

  const createdAt = nowIso();
  const ownerMember: WorkspaceMember = {
    id: memberId,
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
    .map(memberDoc => normalizeMember(memberDoc.id, memberDoc.data() as Record<string, unknown>))
    .sort((a, b) => Number(a.status === 'Removed') - Number(b.status === 'Removed') || a.displayName.localeCompare(b.displayName));
};

const loadWorkspaceRoles = async (workspaceId: string) => {
  if (!db) return [];

  const rolesQuery = query(collection(db, 'roles'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(rolesQuery);

  return snapshot.docs
    .map(roleDoc => ({ id: roleDoc.id, ...roleDoc.data() } as TeamRole))
    .sort((a, b) => TEAM_ROLE_ORDER.indexOf(a.name) - TEAM_ROLE_ORDER.indexOf(b.name));
};

const loadWorkspaceInvitations = async (workspaceId: string) => {
  if (!db) return [];

  const invitationsQuery = query(collection(db, 'teamInvitations'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(invitationsQuery);
  return snapshot.docs
    .map(invitationDoc => normalizeInvitation(invitationDoc.id, invitationDoc.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const loadPendingInvitationsForEmail = async (email?: string | null) => {
  if (!db || !email) return [];

  const invitationsQuery = query(collection(db, 'teamInvitations'), where('email', '==', email.toLowerCase()), where('status', '==', 'Pending'));
  const snapshot = await getDocs(invitationsQuery);
  return snapshot.docs.map(invitationDoc => normalizeInvitation(invitationDoc.id, invitationDoc.data() as Record<string, unknown>));
};

const updateWorkspaceMemberSummary = async (workspaceId: string, member: WorkspaceMember) => {
  if (!db) return;

  const workspaceRef = doc(db, 'workspaces', workspaceId);
  const workspaceSnapshot = await getDoc(workspaceRef);
  if (!workspaceSnapshot.exists()) return;

  const data = workspaceSnapshot.data() as Record<string, unknown>;
  const members = Array.isArray(data.members) ? data.members as WorkspaceMemberSummary[] : [];
  const summary = toMemberSummary(member);
  const nextMembers = members.some(item => item.userId === member.userId)
    ? members.map(item => item.userId === member.userId ? summary : item)
    : [...members, summary];

  await updateDoc(workspaceRef, { members: nextMembers, updatedAt: nowIso() });
};

const logTeamEvent = async ({
  performedBy,
  role,
  action,
  workspaceId,
  memberId,
  oldRole,
  newRole,
  description
}: {
  performedBy: string;
  role?: string;
  action: string;
  workspaceId: string;
  memberId?: string;
  oldRole?: string;
  newRole?: string;
  description: string;
}) => {
  const timestamp = nowIso();

  if (db) {
    await addDoc(collection(db, 'teamAuditLogs'), removeUndefinedFields({
      timestamp,
      performedBy,
      memberId: memberId || '',
      oldRole: oldRole || '',
      newRole: newRole || '',
      workspaceId,
      action,
      description
    }));
  }

  await auditLogService.recordSafely({
    userId: performedBy,
    companyId: workspaceId,
    userRole: role || 'unknown',
    action,
    module: 'team',
    resourceType: 'workspaceMember',
    resourceId: memberId || workspaceId,
    description: [description, oldRole ? `oldRole=${oldRole}` : '', newRole ? `newRole=${newRole}` : ''].filter(Boolean).join(' | '),
    status: 'success'
  });
};

export const teamService = {
  getDefaultRoles() {
    return TEAM_ROLE_ORDER.map(name => ({ name, description: TEAM_ROLE_DESCRIPTIONS[name] }));
  },

  async getPendingInvitations(email?: string | null) {
    return loadPendingInvitationsForEmail(email);
  },

  async loadTeam({
    userId,
    email,
    displayName,
    workspaceId
  }: {
    userId?: string;
    email?: string | null;
    displayName?: string | null;
    workspaceId?: string;
  }): Promise<TeamData> {
    if (!db || !userId || !workspaceId) {
      return { workspace: null, members: [], roles: [], invitations: [], pendingInvitations: [] };
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return { workspace: null, members: [], roles: [], invitations: [], pendingInvitations: [] };
    }

    if (workspace.ownerId === userId) {
      await ensureDefaultRoles(workspace, userId);
      await ensureOwnerMember(workspace, userId, email, displayName);
    }

    const [members, roles, invitations, pendingInvitations] = await Promise.all([
      loadWorkspaceMembers(workspace.id),
      loadWorkspaceRoles(workspace.id),
      loadWorkspaceInvitations(workspace.id),
      loadPendingInvitationsForEmail(email)
    ]);

    return { workspace, members, roles, invitations, pendingInvitations };
  },

  async inviteMember({
    workspace,
    email,
    role,
    invitedBy,
    invitedByEmail,
    invitedByRole
  }: {
    workspace: Workspace;
    email: string;
    role: TeamRoleName;
    invitedBy: string;
    invitedByEmail?: string | null;
    invitedByRole?: string;
  }) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (role === 'Owner') throw new Error('Use ownership transfer to assign the Owner role.');

    const now = nowIso();
    const invitationRef = doc(collection(db, 'teamInvitations'));
    const invitation: TeamInvitation = {
      id: invitationRef.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      email: normalizedEmail,
      role,
      status: 'Pending',
      invitedBy,
      invitedByEmail: invitedByEmail || '',
      createdAt: now,
      updatedAt: now
    };

    await setDoc(invitationRef, removeUndefinedFields(invitation));
    await logTeamEvent({
      performedBy: invitedBy,
      role: invitedByRole,
      action: 'MEMBER_INVITED',
      workspaceId: workspace.id,
      memberId: invitation.id,
      newRole: role,
      description: `Invited ${normalizedEmail} to ${workspace.name}`
    });

    return invitation;
  },

  async acceptInvitation(invitation: TeamInvitation, user: { uid: string; email?: string | null; displayName?: string | null }) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (invitation.status !== 'Pending') throw new Error('Invitation is no longer pending.');
    if (user.email?.toLowerCase() !== invitation.email) throw new Error('This invitation belongs to another email address.');

    const now = nowIso();
    const member: WorkspaceMember = {
      id: `${invitation.workspaceId}_${user.uid}`,
      workspaceId: invitation.workspaceId,
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || invitation.email,
      email: user.email || invitation.email,
      role: invitation.role,
      status: 'Active',
      createdBy: invitation.invitedBy,
      createdAt: now,
      updatedAt: now,
      invitedAt: invitation.createdAt,
      joinedAt: now,
      invitationId: invitation.id
    };

    const invitationRef = doc(db, 'teamInvitations', invitation.id);
    const memberRef = doc(db, 'workspaceMembers', member.id);

    await runTransaction(db, async transaction => {
      const invitationSnapshot = await transaction.get(invitationRef);
      if (!invitationSnapshot.exists()) throw new Error('Invitation no longer exists.');

      const currentInvitation = normalizeInvitation(invitationSnapshot.id, invitationSnapshot.data() as Record<string, unknown>);
      if (currentInvitation.status !== 'Pending') throw new Error('Invitation is no longer pending.');
      if (currentInvitation.email !== user.email?.toLowerCase()) throw new Error('This invitation belongs to another email address.');

      transaction.set(memberRef, removeUndefinedFields({ ...member, role: currentInvitation.role }), { merge: true });
      transaction.update(invitationRef, {
        status: 'Accepted',
        acceptedAt: now,
        acceptedBy: user.uid,
        updatedAt: now
      });
    });

    await logTeamEvent({
      performedBy: user.uid,
      role: invitation.role,
      action: 'INVITATION_ACCEPTED',
      workspaceId: invitation.workspaceId,
      memberId: member.id,
      newRole: invitation.role,
      description: `${member.email} accepted invitation to ${invitation.workspaceName}`
    }).catch(() => undefined);

    return member;
  },

  async declineInvitation(invitation: TeamInvitation, user: { uid: string; email?: string | null }) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (invitation.status !== 'Pending') throw new Error('Invitation is no longer pending.');
    if (user.email?.toLowerCase() !== invitation.email) throw new Error('This invitation belongs to another email address.');

    const now = nowIso();
    await updateDoc(doc(db, 'teamInvitations', invitation.id), {
      status: 'Declined',
      declinedAt: now,
      declinedBy: user.uid,
      updatedAt: now
    });
  },

  async updateMemberRole(member: WorkspaceMember, nextRole: WorkspaceMemberRole, performedBy: string, performedByRole?: string) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (member.role === 'Owner') throw new Error('Owner role can only be changed by transferring ownership.');
    if (nextRole === 'Owner') throw new Error('Use ownership transfer to assign the Owner role.');

    const updatedAt = nowIso();
    await updateDoc(doc(db, 'workspaceMembers', member.id), { role: nextRole, updatedAt });
    await updateWorkspaceMemberSummary(member.workspaceId, { ...member, role: nextRole, updatedAt });
    await logTeamEvent({
      performedBy,
      role: performedByRole,
      action: 'ROLE_CHANGED',
      workspaceId: member.workspaceId,
      memberId: member.id,
      oldRole: member.role,
      newRole: nextRole,
      description: `Changed ${member.email || member.displayName} role`
    });
  },

  async disableMember(member: WorkspaceMember, performedBy: string, performedByRole?: string) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (member.role === 'Owner') throw new Error('Owner cannot be disabled.');

    const updatedAt = nowIso();
    const nextMember = { ...member, status: 'Disabled' as const, disabledAt: updatedAt, updatedAt };
    await updateDoc(doc(db, 'workspaceMembers', member.id), {
      status: 'Disabled',
      disabledAt: updatedAt,
      updatedAt
    });
    await updateWorkspaceMemberSummary(member.workspaceId, nextMember);
    await logTeamEvent({
      performedBy,
      role: performedByRole,
      action: 'MEMBER_DISABLED',
      workspaceId: member.workspaceId,
      memberId: member.id,
      oldRole: member.role,
      newRole: member.role,
      description: `Disabled ${member.email || member.displayName}`
    });
  },

  async reactivateMember(member: WorkspaceMember, performedBy: string, performedByRole?: string) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const updatedAt = nowIso();
    const nextMember = { ...member, status: 'Active' as const, updatedAt };
    await updateDoc(doc(db, 'workspaceMembers', member.id), { status: 'Active', updatedAt });
    await updateWorkspaceMemberSummary(member.workspaceId, nextMember);
    await logTeamEvent({
      performedBy,
      role: performedByRole,
      action: 'MEMBER_REACTIVATED',
      workspaceId: member.workspaceId,
      memberId: member.id,
      description: `Reactivated ${member.email || member.displayName}`
    });
  },

  async removeMember(member: WorkspaceMember, performedBy: string, performedByRole?: string) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (member.role === 'Owner') throw new Error('Owner cannot be removed.');
    if (member.userId === performedBy) throw new Error('You cannot remove yourself from the workspace.');

    const updatedAt = nowIso();
    const nextMember = { ...member, status: 'Removed' as const, removedAt: updatedAt, updatedAt };
    await updateDoc(doc(db, 'workspaceMembers', member.id), {
      status: 'Removed',
      removedAt: updatedAt,
      updatedAt
    });
    await updateWorkspaceMemberSummary(member.workspaceId, nextMember);
    await logTeamEvent({
      performedBy,
      role: performedByRole,
      action: 'MEMBER_REMOVED',
      workspaceId: member.workspaceId,
      memberId: member.id,
      oldRole: member.role,
      description: `Removed ${member.email || member.displayName}`
    });
  },

  async transferOwnership(workspace: Workspace, currentOwner: WorkspaceMember, nextOwner: WorkspaceMember, performedBy: string, performedByRole?: string) {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    if (workspace.ownerId !== performedBy || currentOwner.role !== 'Owner') throw new Error('Only the current owner can transfer ownership.');
    if (nextOwner.status !== 'Active') throw new Error('Ownership can only be transferred to an active member.');

    const updatedAt = nowIso();
    await updateDoc(doc(db, 'workspaces', workspace.id), { ownerId: nextOwner.userId, updatedAt });
    await updateDoc(doc(db, 'workspaceMembers', currentOwner.id), { role: 'Manager', updatedAt });
    await updateDoc(doc(db, 'workspaceMembers', nextOwner.id), { role: 'Owner', updatedAt });
    await updateWorkspaceMemberSummary(workspace.id, { ...currentOwner, role: 'Manager', updatedAt });
    await updateWorkspaceMemberSummary(workspace.id, { ...nextOwner, role: 'Owner', updatedAt });
    await logTeamEvent({
      performedBy,
      role: performedByRole,
      action: 'OWNER_TRANSFERRED',
      workspaceId: workspace.id,
      memberId: nextOwner.id,
      oldRole: nextOwner.role,
      newRole: 'Owner',
      description: `Transferred ownership to ${nextOwner.email || nextOwner.displayName}`
    });
  }
};
