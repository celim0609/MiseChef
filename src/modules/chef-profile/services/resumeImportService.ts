import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../../../firebase';
import { parseResumeToPortfolioWithAI } from '../../../services/gemini';
import { extractResumeText } from '../../portfolio/services/resumeImportService';
import { slugifyProfile } from '../model';
import type { ImportedChefProfile } from '../types';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const validateResumeFile = (file: File) => {
  const extension = file.name.toLowerCase().split('.').pop();
  const validType = (file.type === PDF && extension === 'pdf') || (file.type === DOCX && extension === 'docx');
  if (!validType) throw new Error('Choose a PDF or DOCX resume.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Your resume must be 10 MB or smaller.');
};

const splitDate = (value?: string) => {
  const date = (value || '').trim();
  const match = date.match(/^([A-Za-z]+)?\s*(\d{4})?$/);
  return { month: match?.[1] || '', year: match?.[2] || (date.match(/\d{4}/)?.[0] || '') };
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
  const text = await extractResumeText(file);
  if (text.length < 80) throw new Error('We could not read this resume. You can try another file or continue manually.');

  onStage(3);
  const parsed = await parseResumeToPortfolioWithAI(text, workspaceId);
  const basic = parsed.basicProfile || {};
  const contact = parsed.contact || {};
  const summary = basic.shortBio || parsed.about?.body || '';
  const profile: ImportedChefProfile = {
    basicInfo: {
      fullName: basic.fullName || '',
      professionalTitle: basic.professionalTitle || '',
      location: basic.location || contact.location || '',
      phone: contact.phone || '',
      email: contact.email || '',
      summary
    },
    skills: (parsed.skills || []).map(item => item.name || '').filter(Boolean),
    experiences: (parsed.experience || []).map((item, index) => {
      const start = splitDate(item.startDate);
      const end = splitDate(item.endDate);
      return {
        id: `import-experience-${Date.now()}-${index}`,
        jobTitle: item.role || '',
        companyName: item.organization || '',
        location: item.location || '',
        startMonth: start.month,
        startYear: start.year,
        endMonth: end.month,
        endYear: end.year,
        currentlyWorking: item.isCurrent === true,
        description: item.description || ''
      };
    }),
    education: (parsed.education || []).map((item, index) => ({ id: `import-education-${Date.now()}-${index}`, schoolName: item.schoolName || '', qualification: item.qualification || '', fieldOfStudy: item.fieldOfStudy || '', startYear: item.startYear || '', endYear: item.endYear || '', description: item.description || '' })),
    certificates: (parsed.certificates || []).map((item, index) => ({
      id: `import-certificate-${Date.now()}-${index}`,
      name: item.title || '',
      issuingOrganisation: item.issuer || '',
      issueDate: item.issueDate || '',
      expiryDate: item.expiryDate || '',
      credentialUrl: item.credentialUrl || ''
    })),
    awards: (parsed.awards || []).map((item, index) => ({ id: `import-award-${Date.now()}-${index}`, name: item.name || '', issuingOrganisation: item.issuingOrganisation || '', year: item.year || '', description: item.description || '' })),
    languages: (parsed.languages || []).map((item, index) => ({ id: `import-language-${Date.now()}-${index}`, language: item.language || '', proficiency: item.proficiency || '' })),
    socialLinks: parsed.socialLinks || {},
    portfolio: [],
    profileSlug: slugifyProfile(''),
    summaryGeneratedByAi: Boolean(summary)
  };
  return { profile, originalStoragePath: storagePath };
};
