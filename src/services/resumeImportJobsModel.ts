import {
  normalizeResumePortfolioDraft,
  type GeminiResumePortfolioDraft
} from './resumePortfolioModel';

export type ResumeImportJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export type ResumeImportJobState = {
  status: ResumeImportJobStatus;
  result?: GeminiResumePortfolioDraft;
  error?: string;
  timings?: ResumeImportServerTimings;
};

export type ResumeImportServerTimings = {
  functionStartupMs: number;
  preGeminiMs: number;
  geminiResponseMs: number;
  jsonParsingMs: number;
  resultPublishMs: number;
  totalFunctionMs: number;
};

export const RESUME_IMPORT_SLOW_MESSAGE = 'This is taking longer than expected, you can check back later';

export const getResumeImportJobPath = (uid: string, jobId: string) => (
  `users/${uid}/resumeImportJobs/${jobId}`
);

export const normalizeResumeImportJob = (value: unknown): ResumeImportJobState => {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = String(data.status || '');
  const rawTimings = data.timings && typeof data.timings === 'object'
    ? data.timings as Record<string, unknown>
    : null;
  const timings = rawTimings ? {
    functionStartupMs: Number(rawTimings.functionStartupMs) || 0,
    preGeminiMs: Number(rawTimings.preGeminiMs) || 0,
    geminiResponseMs: Number(rawTimings.geminiResponseMs) || 0,
    jsonParsingMs: Number(rawTimings.jsonParsingMs) || 0,
    resultPublishMs: Number(rawTimings.resultPublishMs) || 0,
    totalFunctionMs: Number(rawTimings.totalFunctionMs) || 0
  } : undefined;
  if (!['pending', 'processing', 'done', 'failed'].includes(status)) {
    throw new Error('Resume import returned an invalid job status.');
  }
  if (status === 'done') {
    return {
      status,
      result: normalizeResumePortfolioDraft(data.result),
      ...(timings ? { timings } : {})
    };
  }
  if (status === 'failed') {
    return {
      status,
      ...(timings ? { timings } : {}),
      error: typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : 'AI analysis failed. Please retry.'
    };
  }
  return { status, ...(timings ? { timings } : {}) } as ResumeImportJobState;
};
