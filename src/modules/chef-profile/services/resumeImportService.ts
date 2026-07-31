import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../../firebase';
import { parseResumeToPortfolioWithAI } from '../../../services/gemini';
import type { ImportedChefProfile } from '../types';
import { mapResumeDraftToChefProfile as mapResumeDraft } from './resumeImportMapping';
import { extractChefResumeText } from './resumeTextExtraction';

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
  onStage: (stage: 1 | 2 | 3) => void
): Promise<{ profile: ImportedChefProfile; originalStoragePath: string }> => {
  validateResumeFile(file);
  if (!storage) throw new Error('Resume upload is temporarily unavailable.');

  onStage(1);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `users/${userId}/chef-profile/resume-imports/${crypto.randomUUID()}-${safeName}`;
  const upload = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: file.type,
    customMetadata: { ownerId: userId, purpose: 'chef-profile-import' }
  });
  await new Promise<void>((resolve, reject) => upload.on('state_changed', undefined, reject, resolve));
  onStage(2);
  const text = await extractChefResumeText(file);
  if (text.length < 80) throw new Error('We could not read this resume. You can try another file or continue manually.');
  console.info('[Resume Import] Text extraction complete', {
    fileType: file.type,
    characters: text.length,
    lines: text.split(/\r?\n/).filter(line => line.trim()).length
  });

  onStage(3);
  const parsed = await parseResumeToPortfolioWithAI(text, workspaceId);
  if (parsed.unmappedSections?.length) {
    console.warn('[Resume Import] Unmapped resume sections', parsed.unmappedSections.map(section => ({
      sectionName: section.sectionName,
      reason: section.reason
    })));
  }
  const profile = mapResumeDraft(parsed);
  return { profile, originalStoragePath: storagePath };
};
