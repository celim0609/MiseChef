import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { taskService, type WorkspaceTask } from '../../services/taskService';
import { getCustomerFriendlyErrorMessage } from '../../utils/customerErrorMessages';

interface TodaysTasksProps {
  workspaceId?: string;
  userId?: string;
  inline?: boolean;
}

export default function TodaysTasks({ workspaceId, userId, inline = false }: TodaysTasksProps) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(inline && workspaceId && userId));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const inlineFormId = useId();
  const addTaskButton = useRef<HTMLButtonElement>(null);

  const closeInlineForm = () => {
    setFormError('');
    setIsDialogOpen(false);
    addTaskButton.current?.focus();
  };

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
    setFormError('');
    setError('');
    try {
      await taskService.createPersonalTask(nextTitle, workspaceId, userId);
      setTitle('');
      if (inline) closeInlineForm();
      else setIsDialogOpen(false);
      await loadTasks();
    } catch (err) {
      const message = getCustomerFriendlyErrorMessage(err, "We couldn't save this task. Please try again.");
      if (inline) setFormError(message);
      else setError(message);
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
    <section className={inline
      ? 'rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4'
      : 'rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm'}>
      <div className={inline ? 'flex flex-wrap items-center justify-between gap-x-3' : 'flex items-center justify-between gap-3'}>
        {inline ? (
          <>
            <h2 className="font-display text-2xl font-bold leading-none text-primary">Today's Tasks</h2>
            {workspaceId && userId && (
              <button ref={addTaskButton} type="button" aria-expanded={isDialogOpen}
                aria-controls={inlineFormId} aria-disabled={isSaving}
                onClick={() => {
                  if (isSaving) return;
                  if (isDialogOpen) closeInlineForm();
                  else setIsDialogOpen(true);
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-extrabold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
                <Plus aria-hidden="true" className="size-4" /> Add Task
              </button>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Today's Tasks</p>
              <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">What needs to be done today.</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-outline" />
          </>
        )}
      </div>

      {inline && workspaceId && userId && (
        <div id={inlineFormId} hidden={!isDialogOpen}>
          {isDialogOpen && (
            <form onSubmit={handleSave} className="my-2 space-y-2 rounded-xl border border-surface-container-high bg-surface-container-low p-3">
              <label htmlFor={`${inlineFormId}-title`} className="block text-sm font-extrabold text-primary">Task name</label>
              <input id={`${inlineFormId}-title`} value={title} onChange={event => setTitle(event.target.value)}
                autoFocus maxLength={120} readOnly={isSaving} required
                className="min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-base text-on-surface focus-visible:outline-2 focus-visible:outline-primary" />
              {formError && <p role="alert" className="text-sm font-bold text-error">{formError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={!title.trim() || isSaving}
                  className="min-h-11 rounded-lg bg-primary px-3 text-xs font-extrabold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">
                  {isSaving ? 'Saving…' : 'Save Task'}
                </button>
                <button type="button" onClick={closeInlineForm} disabled={isSaving}
                  className="min-h-11 rounded-lg px-3 text-xs font-extrabold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className={inline ? 'space-y-1.5' : 'mt-4 space-y-2'}>
        {isLoading ? (
          <p role={inline ? "status" : undefined} className={inline ? "text-sm text-on-surface-variant" : "rounded-xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant"}>Loading tasks...</p>
        ) : error ? (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4">
            <p role={inline ? "alert" : undefined} className="font-sans text-sm font-bold text-error">{error}</p>
            <button type="button" onClick={loadTasks} className="mt-3 rounded-full border border-error/30 bg-white px-4 py-2 font-sans text-xs font-extrabold text-error">Retry</button>
          </div>
        ) : tasks.length > 0 ? tasks.map(task => (
          <label key={task.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low ${inline ? 'min-h-11 px-3 py-2' : 'p-4'}`}>
            <input type="checkbox" checked={false} onChange={() => handleComplete(task)} className="h-5 w-5 rounded border-outline accent-primary" />
            <span className={inline ? "min-w-0 break-words text-sm font-extrabold text-primary" : "font-sans text-sm font-extrabold text-primary"}>{task.title}</span>
          </label>
        )) : inline ? (
          <p className="text-sm text-on-surface-variant">No open tasks.</p>
        ) : (
          <p className="rounded-xl border border-green-200 bg-green-50 p-4 font-sans text-sm font-extrabold text-green-900">Nothing needs your attention today.</p>
        )}
      </div>

      {!inline && workspaceId && userId && (
        <button type="button" onClick={() => setIsDialogOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-2 font-sans text-xs font-extrabold text-primary transition-colors hover:bg-primary/5">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      )}

      {!inline && isDialogOpen && (
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
