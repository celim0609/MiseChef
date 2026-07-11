import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';

export type TaskType = 'personal' | 'system';

export interface WorkspaceTask {
  id: string;
  type: TaskType;
  title: string;
  completed: boolean;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

const readString = (value: unknown) => typeof value === 'string' ? value : '';
const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const normalizeTask = (id: string, data: Record<string, unknown>): WorkspaceTask => ({
  id,
  type: data.type === 'system' ? 'system' : 'personal',
  title: readString(data.title),
  completed: Boolean(data.completed),
  workspaceId: readString(data.workspaceId),
  createdBy: readString(data.createdBy),
  createdAt: readString(data.createdAt),
  completedAt: typeof data.completedAt === 'string' ? data.completedAt : null
});

export const taskService = {
  async listOpenTasks(workspaceId: string): Promise<WorkspaceTask[]> {
    if (!db || !workspaceId) return [];

    const tasksQuery = query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(tasksQuery);

    return snapshot.docs
      .map(taskDoc => normalizeTask(taskDoc.id, taskDoc.data() as Record<string, unknown>))
      .filter(task => !task.completed)
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
      .slice(0, 5);
  },

  async createPersonalTask(title: string, workspaceId: string, createdBy: string): Promise<WorkspaceTask> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const taskRef = doc(collection(db, 'tasks'));
    const task: WorkspaceTask = {
      id: taskRef.id,
      type: 'personal',
      title: title.trim(),
      completed: false,
      workspaceId,
      createdBy,
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    await setDoc(taskRef, {
      type: task.type,
      title: task.title,
      completed: task.completed,
      workspaceId: task.workspaceId,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      completedAt: task.completedAt
    });
    return task;
  },

  async completeTask(taskId: string): Promise<void> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    await updateDoc(doc(db, 'tasks', taskId), {
      completed: true,
      completedAt: new Date().toISOString()
    });
  }
};
