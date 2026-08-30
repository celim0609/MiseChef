import { deleteObject, getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../../firebase';
import { getStorageObjectPath } from '../../../services/storageReference';
import { startResumeToPortfolioJob } from '../../../services/gemini';
import type { ImportedChefProfile } from '../types';
import { logResumeImportFailure, ResumeImportError } from './resumeImportErrors';
import { startExtractedResumeJob } from './resumeParsing';
import { extractChefResumeText } from './resumeTextExtraction';
import { runResumeImportPipeline } from './resumeImportPipeline';
import type { ResumeImportClientTimings } from './resumeImportPipeline';
import { isOwnedResumeStoragePath, type ManagedChefResume, type ResumeFileUpload, type ResumeUploadResult } from './resumeManagementModel';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const validateResumeFile = (file: File) => {
  const extension = file.name.toLowerCase().split('.').pop();
  const validType = (file.type === PDF && extension === 'pdf') || (file.type === DOCX && extension === 'docx');
  if (!validType) throw new ResumeImportError('unsupported_file', 'validation', 'Choose a PDF or DOCX resume.');
  if (file.size > 10 * 1024 * 1024) throw new ResumeImportError('file_too_large', 'validation', 'Your resume must be 10 MB or smaller.');
};

export const importResume = async (
  file: File,
  userId: string,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void,
  onUploaded?: (upload: ResumeFileUpload) => Promise<void>
): Promise<ResumeUploadResult> => {
  validateResumeFile(file);
  if (!storage) throw new ResumeImportError('upload_failed', 'upload', 'Resume upload is temporarily unavailable.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${userId}/chef-profile/resume-imports/${crypto.randomUUID()}-${safeName}`;
  let registeredForRetry = false;
  try {
    const pipeline = await runResumeImportPipeline({
      onStage,
      upload: async () => {
        const upload = uploadBytesResumable(ref(storage, storagePath), file, {
          contentType: file.type,
          customMetadata: { ownerId: userId, purpose: 'chef-profile-import', originalFileName: file.name.slice(0, 255) }
        });
        await new Promise<void>((resolve, reject) => upload.on('state_changed', undefined, reject, resolve));
      },
      register: onUploaded ? () => onUploaded({
          originalStoragePath: storagePath,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size
        }) : undefined,
      extract: async () => {
        const text = await extractChefResumeText(file);
        console.info('[Resume Import] Text extraction complete', {
          fileType: file.type,
          characters: text.length,
          lines: text.split(/\r?\n/).filter(line => line.trim()).length
        });
        return text;
      },
      parse: text => startExtractedResumeJob(text, workspaceId, startResumeToPortfolioJob),
      cleanup: () => deleteObject(ref(storage, storagePath)),
      onTiming: timings => console.info('[Resume Import] Client timings', timings)
    });
    registeredForRetry = pipeline.registeredForRetry;
    return {
      jobId: pipeline.result,
      originalStoragePath: storagePath,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      timings: pipeline.timings
    };
  } catch (error) {
    registeredForRetry = onUploaded
      && error instanceof ResumeImportError
      && !['upload_failed', 'upload_registration_failed'].includes(error.code);
    logResumeImportFailure(error, {
      fileName: file.name,
      storagePath,
      authenticatedUid: userId,
      contentType: file.type,
      fileSize: file.size,
      storageBucket: storage.app.options.storageBucket,
      registeredForRetry
    });
    throw error;
  }
};

const parseResumeFile = async (
  file: File,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void
) => {
  onStage(2);
  const extractionStartedAt = performance.now();
  const text = await extractChefResumeText(file);
  const pdfExtractionMs = performance.now() - extractionStartedAt;
  onStage(3);
  const jobStartedAt = performance.now();
  const jobId = await startExtractedResumeJob(text, workspaceId, startResumeToPortfolioJob);
  const timings: ResumeImportClientTimings = {
    uploadMs: 0,
    metadataMs: 0,
    pdfExtractionMs,
    jobCreationMs: performance.now() - jobStartedAt
  };
  console.info('[Resume Import] Retry client timings', timings);
  return { jobId, timings };
};

export const retryResumeImport = async (
  resume: ManagedChefResume,
  userId: string,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void
) => {
  if (!storage) throw new ResumeImportError('download_failed', 'download', 'Resume import is temporarily unavailable.');
  const storagePath = getStorageObjectPath(resume.storagePath, storage.app.options.storageBucket);
  if (!storagePath || !isOwnedResumeStoragePath(userId, storagePath)) {
    throw new Error('This resume does not belong to the signed-in user.');
  }
  try {
    const blob = await getBlob(ref(storage, storagePath)).catch(error => {
      throw new ResumeImportError('download_failed', 'download', 'Saved resume download failed.', { cause: error });
    });
    const file = new File([blob], resume.fileName, { type: resume.contentType });
    return await parseResumeFile(file, workspaceId, onStage);
  } catch (error) {
    logResumeImportFailure(error, { fileName: resume.fileName, retry: true });
    throw error;
  }
};
