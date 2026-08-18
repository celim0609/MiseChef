import { deleteObject, getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../../firebase';
import { parseResumeToPortfolioWithAI } from '../../../services/gemini';
import type { ImportedChefProfile } from '../types';
import { logResumeImportFailure, ResumeImportError } from './resumeImportErrors';
import { parseExtractedResumeText } from './resumeParsing';
import { extractChefResumeText } from './resumeTextExtraction';
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

  onStage(1);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${userId}/chef-profile/resume-imports/${crypto.randomUUID()}-${safeName}`;
  const upload = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
    customMetadata: { ownerId: userId, purpose: 'chef-profile-import', originalFileName: file.name.slice(0, 255) }
  });
  let registeredForRetry = false;
  try {
    await new Promise<void>((resolve, reject) => upload.on('state_changed', undefined, error => {
      reject(new ResumeImportError('upload_failed', 'upload', 'Resume upload failed.', { cause: error }));
    }, resolve));
    if (onUploaded) {
      try {
        await onUploaded({
          originalStoragePath: storagePath,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size
        });
      } catch (error) {
        throw new ResumeImportError('upload_failed', 'upload', 'Resume upload registration failed.', { cause: error });
      }
      registeredForRetry = true;
    }
    onStage(2);
    const text = await extractChefResumeText(file);
    console.info('[Resume Import] Text extraction complete', {
      fileType: file.type,
      characters: text.length,
      lines: text.split(/\r?\n/).filter(line => line.trim()).length
    });

    onStage(3);
    const profile = await parseExtractedResumeText(text, workspaceId, parseResumeToPortfolioWithAI);
    return {
      profile,
      originalStoragePath: storagePath,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    };
  } catch (error) {
    if (!registeredForRetry) await deleteObject(ref(storage, storagePath)).catch(() => undefined);
    logResumeImportFailure(error, { fileName: file.name, registeredForRetry });
    throw error;
  }
};

const parseResumeFile = async (
  file: File,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void
) => {
  onStage(2);
  const text = await extractChefResumeText(file);
  onStage(3);
  return parseExtractedResumeText(text, workspaceId, parseResumeToPortfolioWithAI);
};

export const retryResumeImport = async (
  resume: ManagedChefResume,
  userId: string,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void
) => {
  if (!storage) throw new ResumeImportError('download_failed', 'download', 'Resume import is temporarily unavailable.');
  if (!isOwnedResumeStoragePath(userId, resume.storagePath)) {
    throw new Error('This resume does not belong to the signed-in user.');
  }
  try {
    const blob = await getBlob(ref(storage, resume.storagePath)).catch(error => {
      throw new ResumeImportError('download_failed', 'download', 'Saved resume download failed.', { cause: error });
    });
    const file = new File([blob], resume.fileName, { type: resume.contentType });
    return await parseResumeFile(file, workspaceId, onStage);
  } catch (error) {
    logResumeImportFailure(error, { fileName: resume.fileName, retry: true });
    throw error;
  }
};
