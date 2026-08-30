import { ResumeImportError } from './resumeImportErrors';

export type ResumeImportClientTimings = {
  uploadMs: number;
  metadataMs: number;
  pdfExtractionMs: number;
  jobCreationMs: number;
};

export interface ResumeImportPipeline<T> {
  upload: () => Promise<void>;
  register?: () => Promise<void>;
  extract: () => Promise<string>;
  parse: (text: string) => Promise<T>;
  cleanup: () => Promise<void>;
  onStage: (stage: 1 | 2 | 3) => void;
  onTiming?: (timings: ResumeImportClientTimings) => void;
}

const now = () => globalThis.performance?.now?.() ?? Date.now();

export const runResumeImportPipeline = async <T>({
  upload,
  register,
  extract,
  parse,
  cleanup,
  onStage,
  onTiming
}: ResumeImportPipeline<T>) => {
  let registeredForRetry = false;
  const timings: ResumeImportClientTimings = {
    uploadMs: 0,
    metadataMs: 0,
    pdfExtractionMs: 0,
    jobCreationMs: 0
  };
  try {
    onStage(1);
    try {
      const startedAt = now();
      await upload();
      timings.uploadMs = now() - startedAt;
    } catch (error) {
      throw new ResumeImportError('upload_failed', 'upload', 'Resume upload failed.', { cause: error });
    }

    if (register) {
      try {
        const startedAt = now();
        await register();
        timings.metadataMs = now() - startedAt;
      } catch (error) {
        throw new ResumeImportError('upload_registration_failed', 'metadata', 'Resume upload registration failed.', { cause: error });
      }
      registeredForRetry = true;
    }

    onStage(2);
    const extractionStartedAt = now();
    const text = await extract();
    timings.pdfExtractionMs = now() - extractionStartedAt;
    onStage(3);
    const jobStartedAt = now();
    const result = await parse(text);
    timings.jobCreationMs = now() - jobStartedAt;
    onTiming?.(timings);
    return { result, registeredForRetry, timings };
  } catch (error) {
    if (!registeredForRetry) await cleanup().catch(() => undefined);
    throw error;
  }
};
