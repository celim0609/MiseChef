import type { ChefProfile, ImportedChefProfile } from '../types';

export type ResumeImportStatus = 'imported' | 'review_required' | 'failed';

export interface ManagedChefResume {
  userId: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  importStatus: ResumeImportStatus;
  uploadedAt?: unknown;
  importedAt?: unknown;
  draft?: ImportedChefProfile;
  lastError?: string;
}

export interface ResumeFileUpload {
  originalStoragePath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface ResumeUploadResult extends ResumeFileUpload {
  profile: ImportedChefProfile;
}

export const getResumeImportSummary = (draft: ImportedChefProfile) => ([
  { label: 'Experience imported', count: draft.experiences.length },
  { label: 'Education imported', count: draft.education.length },
  { label: 'Skills imported', count: draft.skills.length },
  { label: 'Languages imported', count: draft.languages.length }
]);

export const getResumeImportErrorMessage = (error: unknown, fileName = '') => {
  const message = error instanceof Error ? error.message.trim() : '';
  if (message && (
    message.startsWith('Resume imported, but')
    || message.startsWith('The uploaded file is valid')
    || message.startsWith('Unable to read PDF')
    || message.startsWith('Unable to read DOCX')
    || message.startsWith('Choose a PDF or DOCX')
    || message.startsWith('Your resume must be')
  )) return message;
  if (/\.pdf$/i.test(fileName)) return 'Unable to read PDF. Make sure it contains selectable text, then retry or replace it.';
  if (/\.docx$/i.test(fileName)) return 'Unable to read DOCX. Check that the document opens correctly, then retry or replace it.';
  return message || 'Resume import failed. Retry the existing file or replace it with a clearer PDF or DOCX.';
};

export type ResumeReviewSectionKey = 'experiences' | 'education' | 'skills' | 'languages' | 'summary' | 'contact';
export type ResumeReviewChoice = Record<ResumeReviewSectionKey, 'imported' | 'existing'>;
export type ResumeReviewStatus = 'success' | 'review' | 'missing';

export interface ResumeSectionAssessment {
  key: ResumeReviewSectionKey;
  label: string;
  confidence: number;
  status: ResumeReviewStatus;
}

const assessment = (key: ResumeReviewSectionKey, label: string, confidence: number): ResumeSectionAssessment => ({
  key,
  label,
  confidence,
  status: confidence === 0 ? 'missing' : confidence >= 4 ? 'success' : 'review'
});

const completenessStars = (entries: Array<boolean[]>) => {
  if (!entries.length) return 0;
  const completed = entries.reduce((total, fields) => total + fields.filter(Boolean).length, 0);
  const possible = entries.reduce((total, fields) => total + fields.length, 0);
  return Math.max(2, Math.min(5, Math.round(2 + (completed / possible) * 3)));
};

export const assessResumeImport = (draft: ImportedChefProfile): ResumeSectionAssessment[] => {
  const contactCount = [draft.basicInfo.email, draft.basicInfo.phone, draft.basicInfo.location].filter(Boolean).length;
  const summaryLength = draft.basicInfo.summary?.trim().length || 0;
  return [
    assessment('experiences', 'Experience', completenessStars(draft.experiences.map(item => [
      Boolean(item.jobTitle), Boolean(item.companyName), Boolean(item.startYear),
      Boolean(item.currentlyWorking || item.endYear), Boolean(item.description)
    ]))),
    assessment('education', 'Education', completenessStars(draft.education.map(item => [
      Boolean(item.schoolName), Boolean(item.qualification || item.fieldOfStudy), Boolean(item.startYear || item.endYear)
    ]))),
    assessment('skills', 'Skills', draft.skills.length === 0 ? 0 : draft.skills.length >= 5 ? 5 : draft.skills.length >= 2 ? 4 : 3),
    assessment('languages', 'Languages', draft.languages.length === 0 ? 0 : draft.languages.length >= 4 ? 5 : draft.languages.length >= 2 ? 4 : 3),
    assessment('summary', 'Summary', summaryLength === 0 ? 0 : summaryLength >= 160 ? 5 : summaryLength >= 80 ? 4 : 3),
    assessment('contact', 'Contact Information', contactCount === 0 ? 0 : contactCount === 3 ? 5 : contactCount === 2 ? 4 : 3)
  ];
};

export const defaultResumeReviewChoices = (draft: ImportedChefProfile): ResumeReviewChoice => Object.fromEntries(
  assessResumeImport(draft).map(section => [section.key, section.status === 'missing' ? 'existing' : 'imported'])
) as ResumeReviewChoice;

export const applyResumeReviewChoices = (
  current: ChefProfile,
  imported: ImportedChefProfile,
  choices: ResumeReviewChoice
): ChefProfile => ({
  ...current,
  basicInfo: {
    ...current.basicInfo,
    fullName: current.basicInfo.fullName || imported.basicInfo.fullName,
    professionalTitle: current.basicInfo.professionalTitle || imported.basicInfo.professionalTitle,
    ...(choices.summary === 'imported' && imported.basicInfo.summary ? { summary: imported.basicInfo.summary } : {}),
    ...(choices.contact === 'imported' ? {
      email: imported.basicInfo.email || current.basicInfo.email,
      phone: imported.basicInfo.phone || current.basicInfo.phone,
      location: imported.basicInfo.location || current.basicInfo.location
    } : {})
  },
  experiences: choices.experiences === 'imported' && imported.experiences.length ? imported.experiences : current.experiences,
  education: choices.education === 'imported' && imported.education.length ? imported.education : current.education,
  skills: choices.skills === 'imported' && imported.skills.length ? imported.skills : current.skills,
  languages: choices.languages === 'imported' && imported.languages.length ? imported.languages : current.languages
});

export const isOwnedResumeStoragePath = (userId: string, storagePath: string) => (
  storagePath.startsWith(`users/${userId}/chef-profile/resume-imports/`)
  && !storagePath.includes('..')
);

export const resolveOwnedManagedResume = (
  userId: string,
  value?: ManagedChefResume | null
): ManagedChefResume | null => {
  if (!value) return null;
  if (value.userId !== userId || !isOwnedResumeStoragePath(userId, value.storagePath)) {
    throw new Error('Resume import ownership mismatch.');
  }
  return value;
};

export const resumeFileNameFromObjectName = (objectName: string) => (
  objectName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
);

export const buildManagedResumeUpload = (
  userId: string,
  result: ResumeFileUpload
): Omit<ManagedChefResume, 'uploadedAt'> => ({
  userId,
  fileName: result.fileName.trim().slice(0, 255),
  storagePath: result.originalStoragePath,
  contentType: result.contentType,
  fileSize: result.fileSize,
  importStatus: 'review_required'
});
