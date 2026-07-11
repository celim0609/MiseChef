import React, { useEffect, useMemo, useState } from 'react';
import { MailPlus, RefreshCw, ShieldCheck, UserMinus, UserX, UsersRound } from 'lucide-react';
import { canInviteMembers, canManageMembers, canTransferOwnership, TEAM_ROLE_ORDER } from './permissions';
import { teamService } from './services';
import { usageLimitService } from '../../services/usageLimitService';
import type { TeamData, TeamInvitation, WorkspaceMember, WorkspaceMemberRole, WorkspaceMemberStatus } from './types';

interface TeamPageProps {
  userId?: string;
  userEmail?: string | null;
  displayName?: string | null;
  workspaceId?: string;
  workspaceRole?: WorkspaceMemberRole | null;
}

const emptyTeamData: TeamData = { workspace: null, members: [], roles: [], invitations: [], pendingInvitations: [] };

const statusStyles: Record<WorkspaceMemberStatus, string> = {
  Active: 'bg-green-100 text-green-700',
  Invited: 'bg-blue-100 text-blue-700',
  Disabled: 'bg-yellow-100 text-yellow-800',
  Removed: 'bg-red-100 text-red-700'
};

const invitationStatusStyles: Record<TeamInvitation['status'], string> = {
  Pending: 'bg-blue-100 text-blue-700',
  Accepted: 'bg-green-100 text-green-700',
  Declined: 'bg-slate-100 text-slate-700',
  Cancelled: 'bg-red-100 text-red-700'
};

const assignableRoles = TEAM_ROLE_ORDER.filter(role => role !== 'Owner');

export default function TeamPage({ userId, userEmail, displayName, workspaceId, workspaceRole }: TeamPageProps) {
  const [teamData, setTeamData] = useState<TeamData>(emptyTeamData);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>('Chef');
  const [isInviting, setIsInviting] = useState(false);

  const activeMembers = useMemo(
    () => teamData.members.filter(member => member.status === 'Active').length,
    [teamData.members]
  );
  const canInvite = canInviteMembers(workspaceRole);
  const canManage = canManageMembers(workspaceRole);
  const canTransfer = canTransferOwnership(workspaceRole);
  const currentOwner = teamData.members.find(member => member.role === 'Owner');

  const refreshTeam = async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextTeamData = await teamService.loadTeam({ userId, email: userEmail, displayName, workspaceId });
      setTeamData(nextTeamData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load your team. Please refresh the page or try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTeam();
  }, [userId, userEmail, displayName, workspaceId]);

  const handleInviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!teamData.workspace || !userId || !canInvite) return;

    const currentTeamUsage = activeMembers + teamData.pendingInvitations.length;
    const limitCheck = await usageLimitService.canCreateResource(workspaceId || teamData.workspace.id, 'teamMember', currentTeamUsage);
    if (!limitCheck.allowed) {
      setError(limitCheck.message);
      return;
    }

    setIsInviting(true);
    try {
      await teamService.inviteMember({
        workspace: teamData.workspace,
        email: inviteEmail,
        role: inviteRole,
        invitedBy: userId,
        invitedByEmail: userEmail,
        invitedByRole: workspaceRole || undefined
      });
      setInviteEmail('');
      setInviteRole('Chef');
      await refreshTeam();
      setMessage('Invitation created. It will appear when that user signs in with the matching email address.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation could not be sent. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleAcceptInvitation = async (invitation: TeamInvitation) => {
    if (!userId) return;
    setMessage('');
    setError('');

    try {
      await teamService.acceptInvitation(invitation, { uid: userId, email: userEmail, displayName });
      await refreshTeam();
      setMessage(`Invitation to ${invitation.workspaceName} accepted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation could not be accepted. Please try again.');
    }
  };

  const handleDeclineInvitation = async (invitation: TeamInvitation) => {
    if (!userId) return;
    setMessage('');
    setError('');

    try {
      await teamService.declineInvitation(invitation, { uid: userId, email: userEmail });
      await refreshTeam();
      setMessage(`Invitation to ${invitation.workspaceName} declined.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation could not be declined. Please try again.');
    }
  };

  const handleRoleChange = async (member: WorkspaceMember, role: WorkspaceMemberRole) => {
    if (!userId || !canManage || role === member.role) return;
    setMessage('');
    setError('');

    try {
      await teamService.updateMemberRole(member, role, userId, workspaceRole || undefined);
      await refreshTeam();
      setMessage(`${member.displayName} is now ${role}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role could not be changed. Please try again.');
    }
  };

  const handleDisableMember = async (member: WorkspaceMember) => {
    if (!userId || !canManage) return;
    setMessage('');
    setError('');

    try {
      await teamService.disableMember(member, userId, workspaceRole || undefined);
      await refreshTeam();
      setMessage(`${member.displayName} has been disabled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Member could not be disabled. Please try again.');
    }
  };

  const handleReactivateMember = async (member: WorkspaceMember) => {
    if (!userId || !canManage) return;
    setMessage('');
    setError('');

    try {
      await teamService.reactivateMember(member, userId, workspaceRole || undefined);
      await refreshTeam();
      setMessage(`${member.displayName} has been reactivated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Member could not be reactivated. Please try again.');
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!userId || !canManage) return;
    if (!window.confirm(`Remove ${member.displayName} from this workspace? Historical records will be kept.`)) return;
    setMessage('');
    setError('');

    try {
      await teamService.removeMember(member, userId, workspaceRole || undefined);
      await refreshTeam();
      setMessage(`${member.displayName} has been removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Member could not be removed. Please try again.');
    }
  };

  const handleTransferOwnership = async (member: WorkspaceMember) => {
    if (!teamData.workspace || !currentOwner || !userId || !canTransfer) return;
    if (!window.confirm(`Transfer workspace ownership to ${member.displayName}? You will become Manager.`)) return;
    setMessage('');
    setError('');

    try {
      await teamService.transferOwnership(teamData.workspace, currentOwner, member, userId, workspaceRole || undefined);
      await refreshTeam();
      setMessage(`Ownership transferred to ${member.displayName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ownership could not be transferred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl bg-surface-container-low p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">
                Workspace
              </p>
              <h1 className="font-display text-4xl font-semibold text-primary">
                Team
              </h1>
              <p className="mt-2 max-w-2xl font-sans text-sm font-bold text-on-surface-variant">
                Manage invitations, roles, and member access for this workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshTeam}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm transition-all active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Team
            </button>
          </div>
        </section>

        {message && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm font-bold text-green-700">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {teamData.pendingInvitations.length > 0 && (
          <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <h2 className="font-display text-2xl font-semibold text-primary">Pending Invitations</h2>
            <div className="mt-4 space-y-3">
              {teamData.pendingInvitations.map(invitation => (
                <div key={invitation.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-sans text-sm font-extrabold text-primary">{invitation.workspaceName}</p>
                    <p className="font-sans text-xs font-bold text-on-surface-variant">Role: {invitation.role}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDeclineInvitation(invitation)} className="rounded-full border border-blue-200 bg-white px-4 py-2 font-sans text-xs font-extrabold text-primary">
                      Decline
                    </button>
                    <button type="button" onClick={() => handleAcceptInvitation(invitation)} className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary">
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Workspace</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">
              {teamData.workspace?.name || 'Team setup'}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Active Members</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">{activeMembers}</p>
          </div>
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Roles</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">{teamData.roles.length || TEAM_ROLE_ORDER.length}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-primary">Invite Member</h2>
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                Owners and Managers can invite new users by email. Email delivery is prepared as a placeholder notification for now.
              </p>
            </div>
            <MailPlus className="h-6 w-6 text-secondary" />
          </div>
          <form onSubmit={handleInviteMember} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              type="email"
              value={inviteEmail}
              onChange={event => setInviteEmail(event.target.value)}
              disabled={!canInvite}
              placeholder="member@example.com"
              className="rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-50"
            />
            <select
              value={inviteRole}
              onChange={event => setInviteRole(event.target.value as WorkspaceMemberRole)}
              disabled={!canInvite}
              className="rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary disabled:opacity-50"
            >
              {assignableRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            <button
              type="submit"
              disabled={!canInvite || isInviting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <MailPlus className="h-4 w-4" />
              {isInviting ? 'Sending...' : 'Send Invitation'}
            </button>
          </form>
          {!canInvite && <p className="mt-3 font-sans text-xs font-bold text-on-surface-variant">Only workspace Owners and Managers can invite members.</p>}
        </section>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-primary">Members</h2>
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                Active members can access the workspace based on their role. Disabled members keep history but cannot use the workspace.
              </p>
            </div>
            <UsersRound className="h-6 w-6 text-secondary" />
          </div>

          {isLoading ? (
            <div className="rounded-2xl bg-surface-container-low p-8 text-center font-sans text-sm font-bold text-on-surface-variant">
              Loading team...
            </div>
          ) : teamData.members.length === 0 ? (
            <div className="rounded-2xl bg-surface-container-low p-8 text-center">
              <p className="font-display text-2xl font-semibold text-primary">No members yet</p>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">
                Invite the first team member to start collaborating.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-surface-container-high">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-surface-container-high">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="px-4 py-3 text-left font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-outline">Member</th>
                      <th className="px-4 py-3 text-left font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-outline">Role</th>
                      <th className="px-4 py-3 text-left font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-outline">Status</th>
                      <th className="px-4 py-3 text-right font-sans text-xs font-extrabold uppercase tracking-[0.12em] text-outline">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high bg-background">
                    {teamData.members.map(member => {
                      const isOwner = member.role === 'Owner';
                      const isCurrentUser = member.userId === userId;
                      const isRemoved = member.status === 'Removed';
                      return (
                        <tr key={member.id} className={isRemoved ? 'opacity-60' : ''}>
                          <td className="px-4 py-4">
                            <p className="font-sans text-sm font-extrabold text-primary">{member.displayName}</p>
                            <p className="font-sans text-xs font-bold text-on-surface-variant">{member.email || 'No email on file'}</p>
                          </td>
                          <td className="px-4 py-4">
                            {canManage && !isOwner && !isRemoved ? (
                              <select
                                value={member.role}
                                onChange={event => handleRoleChange(member, event.target.value as WorkspaceMemberRole)}
                                className="rounded-full border border-surface-container-high bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary outline-none"
                              >
                                {assignableRoles.map(role => <option key={role} value={role}>{role}</option>)}
                              </select>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {member.role}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 font-sans text-xs font-extrabold ${statusStyles[member.status]}`}>
                              {member.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap justify-end gap-2">
                              {canTransfer && !isOwner && member.status === 'Active' && (
                                <button
                                  type="button"
                                  onClick={() => handleTransferOwnership(member)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 font-sans text-xs font-extrabold text-primary transition-all active:scale-95"
                                >
                                  Transfer Owner
                                </button>
                              )}
                              {member.status === 'Disabled' ? (
                                <button
                                  type="button"
                                  onClick={() => handleReactivateMember(member)}
                                  disabled={!canManage || isOwner || isRemoved}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-2 font-sans text-xs font-extrabold text-primary transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  Reactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDisableMember(member)}
                                  disabled={!canManage || isOwner || member.status === 'Disabled' || isRemoved}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-2 font-sans text-xs font-extrabold text-primary transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                  Disable
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member)}
                                disabled={!canManage || isOwner || isCurrentUser || isRemoved}
                                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-2 font-sans text-xs font-extrabold text-red-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <h2 className="font-display text-2xl font-semibold text-primary">Invitations</h2>
          <div className="mt-4 space-y-3">
            {teamData.invitations.length > 0 ? teamData.invitations.map(invitation => (
              <div key={invitation.id} className="flex flex-col gap-2 rounded-2xl bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-sans text-sm font-extrabold text-primary">{invitation.email}</p>
                  <p className="font-sans text-xs font-bold text-on-surface-variant">Role: {invitation.role}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 font-sans text-xs font-extrabold ${invitationStatusStyles[invitation.status]}`}>{invitation.status}</span>
              </div>
            )) : (
              <div className="rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">No invitations have been sent yet.</div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <h2 className="font-display text-2xl font-semibold text-primary">Default Roles</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {teamService.getDefaultRoles().map(role => (
              <div key={role.name} className="rounded-2xl bg-surface-container-low p-4">
                <p className="font-sans text-sm font-extrabold text-primary">{role.name}</p>
                <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{role.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
