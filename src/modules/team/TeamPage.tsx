import React, { useEffect, useMemo, useState } from 'react';
import { MailPlus, ShieldCheck, UserMinus, UserX, UsersRound } from 'lucide-react';
import { teamService } from './services';
import type { TeamData, WorkspaceMember, WorkspaceMemberStatus } from './types';

interface TeamPageProps {
  userId?: string;
  userEmail?: string | null;
  displayName?: string | null;
}

const statusStyles: Record<WorkspaceMemberStatus, string> = {
  Active: 'bg-green-100 text-green-700',
  Invited: 'bg-blue-100 text-blue-700',
  Disabled: 'bg-yellow-100 text-yellow-800',
  Removed: 'bg-red-100 text-red-700'
};

export default function TeamPage({ userId, userEmail, displayName }: TeamPageProps) {
  const [teamData, setTeamData] = useState<TeamData>({ workspace: null, members: [], roles: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeMembers = useMemo(
    () => teamData.members.filter(member => member.status !== 'Removed').length,
    [teamData.members]
  );

  const refreshTeam = async () => {
    setIsLoading(true);
    setError('');

    try {
      const nextTeamData = await teamService.loadTeam(userId, userEmail, displayName);
      setTeamData(nextTeamData);
    } catch (err) {
      setError('Team workspace could not be loaded. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTeam();
  }, [userId, userEmail, displayName]);

  const handleInvitePlaceholder = () => {
    setMessage('Invite member workflow coming soon.');
    setError('');
  };

  const handleDisableMember = async (member: WorkspaceMember) => {
    setMessage('');
    setError('');

    try {
      await teamService.disableMember(member);
      await refreshTeam();
      setMessage(`${member.displayName} has been disabled.`);
    } catch (err) {
      setError('Member could not be disabled. Please try again.');
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    setMessage('');
    setError('');

    try {
      await teamService.removeMember(member);
      await refreshTeam();
      setMessage(`${member.displayName} has been removed.`);
    } catch (err) {
      setError('Member could not be removed. Please try again.');
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
                Manage the people and default roles that will power multi-user restaurant access.
              </p>
            </div>
            <button
              type="button"
              onClick={handleInvitePlaceholder}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm transition-all active:scale-95"
            >
              <MailPlus className="h-4 w-4" />
              Invite Member
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Workspace</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">
              {teamData.workspace?.name || 'Workspace setup'}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Members</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">{activeMembers}</p>
          </div>
          <div className="rounded-2xl border border-surface-container-high bg-background p-5">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-outline">Roles</p>
            <p className="mt-2 font-display text-2xl font-semibold text-primary">{teamData.roles.length || 8}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-surface-container-high bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-primary">Members</h2>
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                Role enforcement will be connected in a future sprint.
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
                The workspace owner will appear here once the team foundation is ready.
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
                      return (
                        <tr key={member.id}>
                          <td className="px-4 py-4">
                            <p className="font-sans text-sm font-extrabold text-primary">{member.displayName}</p>
                            <p className="font-sans text-xs font-bold text-on-surface-variant">{member.email || 'No email on file'}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-extrabold text-primary">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {member.role}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-3 py-1 font-sans text-xs font-extrabold ${statusStyles[member.status]}`}>
                              {member.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleDisableMember(member)}
                                disabled={isOwner || member.status === 'Disabled'}
                                className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-2 font-sans text-xs font-extrabold text-primary transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <UserX className="h-3.5 w-3.5" />
                                Disable
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member)}
                                disabled={isOwner}
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

