import { useState, type FormEvent } from 'react';
import { Building2, X } from 'lucide-react';
import type { RegionCode, WorkspaceType } from '../types';
import { DEFAULT_REGION_CODE, REGION_CONFIGURATIONS } from '../regions';

const workspaceTypes: WorkspaceType[] = [
  'Restaurant',
  'Cafe',
  'Bakery',
  'Hotel',
  'Cloud Kitchen',
  'Other'
];

export interface CreateWorkspaceInput {
  name: string;
  country: RegionCode;
  type?: WorkspaceType;
}

interface CreateWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateWorkspaceInput) => Promise<void>;
}

export default function CreateWorkspaceDialog({
  isOpen,
  onClose,
  onCreate
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState<RegionCode>(DEFAULT_REGION_CODE);
  const [type, setType] = useState<WorkspaceType | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;
    if (!name.trim()) {
      setError('Enter a workspace name.');
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        country,
        type: type || undefined
      });
      setName('');
      setCountry(DEFAULT_REGION_CODE);
      setType('');
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create the workspace.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="create-workspace-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">New Workspace</p>
              <h2 id="create-workspace-title" className="mt-1 font-display text-3xl font-bold text-primary">Create Workspace</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isCreating} aria-label="Close Create Workspace" className="rounded-full bg-surface-container p-2 text-primary disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-5 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
          Choose the Workspace operating country once. Currency and future regional services will follow it automatically.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Workspace Name</span>
            <input
              autoFocus
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={isCreating}
              autoComplete="organization"
              className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Operating Country</span>
            <select
              value={country}
              onChange={event => setCountry(event.target.value as RegionCode)}
              disabled={isCreating}
              className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            >
              {Object.values(REGION_CONFIGURATIONS).map(region => (
                <option key={region.country} value={region.country}>
                  {region.countryName} ({region.country}) · {region.currency}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-sans text-xs font-extrabold text-primary">Workspace Type <span className="text-outline">(optional)</span></span>
            <select
              value={type}
              onChange={event => setType(event.target.value as WorkspaceType | '')}
              disabled={isCreating}
              className="mt-2 w-full rounded-2xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            >
              <option value="">Select a type</option>
              {workspaceTypes.map(workspaceType => (
                <option key={workspaceType} value={workspaceType}>{workspaceType}</option>
              ))}
            </select>
          </label>

          {error && <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{error}</p>}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isCreating} className="rounded-full bg-surface-container px-5 py-3 font-sans text-sm font-extrabold text-primary disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isCreating} className="rounded-full bg-primary px-6 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-60">
              {isCreating ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
