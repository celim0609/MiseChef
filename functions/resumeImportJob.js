export const RESUME_IMPORT_TIMEOUT_MESSAGE = 'AI analysis timed out, please retry';

export class ResumeImportTimeoutError extends Error {
  constructor(message = RESUME_IMPORT_TIMEOUT_MESSAGE) {
    super(message);
    this.name = 'ResumeImportTimeoutError';
    this.code = 'resume-import-timeout';
  }
}

export const withResumeImportTimeout = async (operation, timeoutMs = 70_000) => {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new ResumeImportTimeoutError()), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const getResumeImportJobError = error => {
  if (error instanceof ResumeImportTimeoutError || error?.code === 'resume-import-timeout') {
    return RESUME_IMPORT_TIMEOUT_MESSAGE;
  }
  if (error?.code === 'resource-exhausted' && typeof error?.message === 'string') {
    return error.message;
  }
  if (error?.code === 'failed-precondition' && error?.details?.reason === 'incomplete-extraction') {
    return 'AI analysis could not extract the complete resume. Please retry.';
  }
  if (/timeout|deadline/i.test(String(error?.message || ''))) {
    return RESUME_IMPORT_TIMEOUT_MESSAGE;
  }
  return 'AI analysis failed. Please retry.';
};

export const getResumeImportClientJobPath = (uid, jobId) => (
  `users/${uid}/resumeImportJobs/${jobId}`
);
