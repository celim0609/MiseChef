import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Building2 } from 'lucide-react';
import type { UserRole, WorkspaceType } from '../../../types';
import { workspaceService } from '../../../services/workspaceService';

const workspaceTypes: WorkspaceType[] = [
  'Restaurant',
  'Cafe',
  'Bakery',
  'Hotel',
  'Cloud Kitchen',
  'Other'
];

interface AdminWorkspaceQaPageProps {
  currentUser: User;
  currentUserRole: UserRole;
  onWorkspaceCreated: (workspaceId: string) => Promise<void>;
}

export function AdminWorkspaceQaPage({
  currentUser,
  currentUserRole,
  onWorkspaceCreated
}: AdminWorkspaceQaPageProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;

    const name = workspaceName.trim();
    if (!name) {
      setError('Enter a workspace name.');
      setSuccess('');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const workspace = await workspaceService.createFounderQaWorkspace({
        user: currentUser,
        platformRole: currentUserRole,
        name,
        type: workspaceType || undefined
      });
      await onWorkspaceCreated(workspace.id);
      setWorkspaceName('');
      setWorkspaceType('');
      setSuccess(`${workspace.name} was created and selected.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the workspace. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Founder QA only</p>
          <h3 className="mt-1 font-display text-2xl font-bold text-primary">Create Test Workspace</h3>
          <p className="mt-2 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
            Create a standard workspace and owner membership to verify multi-workspace isolation. This tool is available only to MiseChef super admins.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-5">
        <label className="block">
          <span className="font-sans text-xs font-extrabold text-primary">Workspace Name</span>
          <input
            type="text"
            value={workspaceName}
            onChange={event => setWorkspaceName(event.target.value)}
            disabled={isCreating}
            autoComplete="off"
            className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="font-sans text-xs font-extrabold text-primary">Workspace Type <span className="text-outline">(optional)</span></span>
          <select
            value={workspaceType}
            onChange={event => setWorkspaceType(event.target.value as WorkspaceType | '')}
            disabled={isCreating}
            className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
          >
            <option value="">Select a type</option>
            {workspaceTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="rounded-2xl bg-primary/10 px-4 py-3 font-sans text-sm font-bold text-primary">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="rounded-full bg-primary px-6 py-3 font-sans text-sm font-extrabold text-on-primary transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? 'Creating Workspace…' : 'Create Workspace'}
        </button>
      </form>
    </section>
  );
}
