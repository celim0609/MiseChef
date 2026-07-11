import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { taskService, type WorkspaceTask } from '../../services/taskService';
import { getCustomerFriendlyErrorMessage } from '../../utils/customerErrorMessages';

interface TodaysTasksProps {
  workspaceId?: string;
  userId?: string;
}

export default function TodaysTasks({ workspaceId, userId }: TodaysTasksProps) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    if (!workspaceId || !userId) {
      setTasks([]);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      setTasks(await taskService.listOpenTasks(workspaceId));
    } catch (err) {
      setError(getCustomerFriendlyErrorMessage(err, "We couldn't load today's tasks. Please refresh the page or try again."));
    } finally {
      setIsLoading(false);
    }
  }, [userId, workspaceId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || !workspaceId || !userId) return;

    setIsSaving(true);
    setError('');
    try {
      await taskService.createPersonalTask(nextTitle, workspaceId, userId);
      setTitle('');
      setIsDialogOpen(false);
      await loadTasks();
    } catch (err) {
      setError(getCustomerFriendlyErrorMessage(err, "We couldn't save this task. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async (task: WorkspaceTask) => {
    setTasks(current => current.filter(item => item.id !== task.id));
    setError('');
    try {
      await taskService.completeTask(task.id);
    } catch (err) {
      setTasks(current => [task, ...current].slice(0, 5));
      setError(getCustomerFriendlyErrorMessage(err, "We couldn't complete this task. Please try again."));
    }
  };

  return (
    <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Today's Tasks</p>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">What needs to be done today.</p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-outline" />
      </div>

      {error && <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 font-sans text-xs font-bold text-error">{error}</p>}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant">Loading tasks...</p>
        ) : tasks.length > 0 ? tasks.map(task => (
          <label key={task.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-4">
            <input type="checkbox" checked={false} onChange={() => handleComplete(task)} className="h-5 w-5 rounded border-outline accent-primary" />
            <span className="font-sans text-sm font-extrabold text-primary">{task.title}</span>
          </label>
        )) : (
          <p className="rounded-xl border border-green-200 bg-green-50 p-4 font-sans text-sm font-extrabold text-green-900">Nothing needs your attention today.</p>
        )}
      </div>

      {workspaceId && userId && (
        <button type="button" onClick={() => setIsDialogOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-2 font-sans text-xs font-extrabold text-primary transition-colors hover:bg-primary/5">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      )}

      {isDialogOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
          <form onSubmit={handleSave} className="w-full max-w-sm rounded-2xl border border-surface-container-high bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 id="add-task-title" className="font-display text-xl font-bold text-primary">Add Task</h2>
              <button type="button" onClick={() => setIsDialogOpen(false)} aria-label="Close add task dialog" className="rounded-full p-2 text-outline hover:bg-surface-container"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-5 block font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary" htmlFor="task-title">Task</label>
            <input id="task-title" value={title} onChange={event => setTitle(event.target.value)} autoFocus maxLength={120} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary" />
            <button type="submit" disabled={!title.trim() || isSaving} className="mt-5 w-full rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? 'Saving...' : 'Save'}</button>
          </form>
        </div>
      )}
    </section>
  );
}
