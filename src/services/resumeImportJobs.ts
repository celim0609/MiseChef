import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { GeminiResumePortfolioDraft } from './resumePortfolioModel';
import {
  getResumeImportJobPath,
  normalizeResumeImportJob,
  RESUME_IMPORT_SLOW_MESSAGE,
  type ResumeImportServerTimings,
  type ResumeImportJobState
} from './resumeImportJobsModel';
export {
  getResumeImportJobPath,
  normalizeResumeImportJob,
  RESUME_IMPORT_SLOW_MESSAGE,
  type ResumeImportJobState,
  type ResumeImportServerTimings,
  type ResumeImportJobStatus
} from './resumeImportJobsModel';

export const subscribeToResumeImportJob = (
  uid: string,
  jobId: string,
  onChange: (job: ResumeImportJobState) => void,
  onError: (error: Error) => void
) => {
  if (!db) {
    onError(new Error('Resume import status is temporarily unavailable.'));
    return () => undefined;
  }
  return onSnapshot(doc(db, getResumeImportJobPath(uid, jobId)), snapshot => {
    if (!snapshot.exists()) return;
    try {
      const data = snapshot.data();
      if (data.uid !== uid) throw new Error('Resume import job ownership did not match.');
      onChange(normalizeResumeImportJob(data));
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Resume import status was invalid.'));
    }
  }, error => onError(error));
};

export const waitForResumeImportJob = (uid: string, jobId: string, timeoutMs = 120_000) => (
  new Promise<GeminiResumePortfolioDraft>((resolve, reject) => {
    let unsubscribe = () => undefined;
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(RESUME_IMPORT_SLOW_MESSAGE));
    }, timeoutMs);
    const finish = (operation: () => void) => {
      window.clearTimeout(timeout);
      unsubscribe();
      operation();
    };
    unsubscribe = subscribeToResumeImportJob(uid, jobId, job => {
      if (job.status === 'done' && job.result) finish(() => resolve(job.result));
      if (job.status === 'failed') finish(() => reject(new Error(job.error)));
    }, error => finish(() => reject(error)));
  })
);
