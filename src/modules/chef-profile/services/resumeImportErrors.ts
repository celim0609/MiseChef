export type ResumeImportErrorCode =
  | 'unsupported_file'
  | 'file_too_large'
  | 'upload_failed'
  | 'download_failed'
  | 'pdf_invalid'
  | 'pdf_corrupted'
  | 'pdf_worker_failed'
  | 'pdf_parse_failed'
  | 'pdf_empty_text'
  | 'resume_text_too_short'
  | 'docx_parse_failed'
  | 'resume_parser_failed'
  | 'resume_parser_network_failed'
  | 'unknown';

export type ResumeImportStage = 'validation' | 'upload' | 'download' | 'pdf-worker' | 'pdf-parse' | 'text-validation' | 'resume-parser';

export class ResumeImportError extends Error {
  readonly code: ResumeImportErrorCode;
  readonly stage: ResumeImportStage;

  constructor(code: ResumeImportErrorCode, stage: ResumeImportStage, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ResumeImportError';
    this.code = code;
    this.stage = stage;
  }
}

export const isResumeImportError = (error: unknown): error is ResumeImportError => error instanceof ResumeImportError;

export const isPdfWorkerFailure = (error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error || '');
  return /worker|workersrc|fake worker|dynamically imported module|api version.+worker version|importscripts/i.test(message);
};

export const classifyPdfFailure = (error: unknown) => {
  if (isResumeImportError(error)) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');

  if (isPdfWorkerFailure(error)) {
    return new ResumeImportError('pdf_worker_failed', 'pdf-worker', 'PDF.js worker failed.', { cause: error });
  }
  if (name === 'InvalidPDFException' || /invalid pdf structure|invalid pdf/i.test(message)) {
    return new ResumeImportError('pdf_invalid', 'pdf-parse', 'PDF.js rejected the PDF structure.', { cause: error });
  }
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new ResumeImportError('pdf_invalid', 'pdf-parse', 'Password-protected PDFs are not supported.', { cause: error });
  }
  if (name === 'MissingPDFException' || /unexpected response|truncated|xref|corrupt/i.test(message)) {
    return new ResumeImportError('pdf_corrupted', 'pdf-parse', 'The PDF appears to be corrupted.', { cause: error });
  }
  return new ResumeImportError('pdf_parse_failed', 'pdf-parse', 'PDF.js could not parse the document.', { cause: error });
};

export const logResumeImportFailure = (error: unknown, context: Record<string, unknown> = {}) => {
  const classified = isResumeImportError(error)
    ? error
    : new ResumeImportError('unknown', 'resume-parser', error instanceof Error ? error.message : 'Unknown resume import failure', { cause: error });
  const cause = classified.cause;
  console.error('[Resume Import] Failed', {
    stage: classified.stage,
    code: classified.code,
    message: classified.message,
    causeName: cause instanceof Error ? cause.name : undefined,
    causeMessage: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
    ...context
  });
};
