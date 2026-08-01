import { deleteObject, getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../../firebase';
import { parseResumeToPortfolioWithAI } from '../../../services/gemini';
import type { ImportedChefProfile } from '../types';
import { mapResumeDraftToChefProfile as mapResumeDraft } from './resumeImportMapping';
import { extractChefResumeText } from './resumeTextExtraction';
import { getResumeImportErrorMessage, getReusableExtractedResumeText, isOwnedResumeStoragePath, type ManagedChefResume, type ResumeFileUpload, type ResumeUploadResult } from './resumeManagementModel';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const validateResumeFile = (file: File) => {
  const extension = file.name.toLowerCase().split('.').pop();
  const validType = (file.type === PDF && extension === 'pdf') || (file.type === DOCX && extension === 'docx');
  if (!validType) throw new Error('Choose a PDF or DOCX resume.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Your resume must be 10 MB or smaller.');
};

export const importResume = async (
  file: File,
  userId: string,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void,
  onUploaded?: (upload: ResumeFileUpload) => Promise<void>,
  onExtractedText?: (text: string) => Promise<void>
): Promise<ResumeUploadResult> => {
  validateResumeFile(file);
  if (!storage) throw new Error('Resume upload is temporarily unavailable.');

  onStage(1);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${userId}/chef-profile/resume-imports/${crypto.randomUUID()}-${safeName}`;
  const upload = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
    customMetadata: { ownerId: userId, purpose: 'chef-profile-import', originalFileName: file.name.slice(0, 255) }
  });
  let registeredForRetry = false;
  try {
    await new Promise<void>((resolve, reject) => upload.on('state_changed', undefined, reject, resolve)).catch(error => {
      console.error('[Resume Import] Storage upload failed', error);
      throw error;
    });
    if (onUploaded) {
      await onUploaded({
        originalStoragePath: storagePath,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size
      }).catch(error => {
        console.error('[Resume Import] Resume metadata registration failed', error);
        throw error;
      });
      registeredForRetry = true;
    }
    onStage(2);
    const text = await extractChefResumeText(file).catch(error => {
      console.error('[Resume Import] PDF/DOCX text extraction failed', {
        stage: 'text-extraction',
        fileType: file.type,
        code: (error as { code?: unknown })?.code || '',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : ''
      });
      throw error;
    });
    if (text.length < 80) throw new Error(getResumeImportErrorMessage(new Error('Insufficient text'), file.name));
    console.info('[Resume Import] Text extraction complete', {
      fileType: file.type,
      characters: text.length,
      lines: text.split(/\r?\n/).filter(line => line.trim()).length
    });
    await onExtractedText?.(text);

    onStage(3);
    const parsed = await parseResumeToPortfolioWithAI(text, workspaceId);
    if (parsed.unmappedSections?.length) {
      console.warn('[Resume Import] Unmapped resume sections', parsed.unmappedSections.map(section => ({
        sectionName: section.sectionName,
        reason: section.reason
      })));
    }
    const profile = mapResumeDraft(parsed);
    return {
      profile,
      originalStoragePath: storagePath,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    };
  } catch (error) {
    if (!registeredForRetry) await deleteObject(ref(storage, storagePath)).catch(() => undefined);
    throw error;
  }
};

const parseResumeFile = async (
  file: File,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void,
  onExtractedText?: (text: string) => Promise<void>
) => {
  onStage(2);
  const text = await extractChefResumeText(file).catch(error => {
    console.error('[Resume Import] Stored PDF/DOCX text extraction failed', {
      stage: 'text-extraction',
      fileType: file.type,
      code: (error as { code?: unknown })?.code || '',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : ''
    });
    throw error;
  });
  if (text.length < 80) throw new Error(getResumeImportErrorMessage(new Error('Insufficient text'), file.name));
  await onExtractedText?.(text);
  onStage(3);
  return mapResumeDraft(await parseResumeToPortfolioWithAI(text, workspaceId));
};

export const retryResumeImport = async (
  resume: ManagedChefResume,
  userId: string,
  workspaceId: string,
  onStage: (stage: 1 | 2 | 3) => void,
  onExtractedText?: (text: string) => Promise<void>
) => {
  if (!isOwnedResumeStoragePath(userId, resume.storagePath)) {
    throw new Error('This resume does not belong to the signed-in user.');
  }
  const extractedText = getReusableExtractedResumeText(resume);
  if (extractedText) {
    onStage(3);
    return mapResumeDraft(await parseResumeToPortfolioWithAI(extractedText, workspaceId));
  }
  if (!storage) throw new Error('Resume import is temporarily unavailable.');
  const blob = await getBlob(ref(storage, resume.storagePath));
  const file = new File([blob], resume.fileName, { type: resume.contentType });
  return parseResumeFile(file, workspaceId, onStage, onExtractedText);
};
