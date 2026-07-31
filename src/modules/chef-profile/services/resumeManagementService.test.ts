import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResumeReviewChoices, assessResumeImport, buildManagedResumeUpload, defaultResumeReviewChoices, getResumeImportErrorMessage, getResumeImportSummary, isOwnedResumeStoragePath, resolveOwnedManagedResume, resumeFileNameFromObjectName } from './resumeManagementModel';
import { emptyChefProfile } from '../model';
import type { ImportedChefProfile } from '../types';

const draft = {
  basicInfo: { fullName: 'Chef Example', professionalTitle: 'Sous Chef' },
  skills: [], experiences: [], education: [], certificates: [], awards: [], languages: [],
  socialLinks: {}, portfolio: [], profileSlug: ''
} satisfies ImportedChefProfile;

test('resume metadata contains only the private file and pending import draft', () => {
  const record = buildManagedResumeUpload('alice', {
    originalStoragePath: 'users/alice/chef-profile/resume-imports/resume.pdf',
    fileName: 'resume.pdf',
    contentType: 'application/pdf',
    fileSize: 2048
  });

  assert.deepEqual(Object.keys(record).sort(), [
    'contentType', 'fileName', 'fileSize', 'importStatus', 'storagePath', 'userId'
  ]);
  assert.equal(record.importStatus, 'review_required');
  assert.equal('chefProfile' in record, false);
  assert.equal('publicChefProfile' in record, false);
});

test('resume operations are restricted to the signed-in user import path', () => {
  assert.equal(isOwnedResumeStoragePath('alice', 'users/alice/chef-profile/resume-imports/resume.pdf'), true);
  assert.equal(isOwnedResumeStoragePath('alice', 'users/bob/chef-profile/resume-imports/resume.pdf'), false);
  assert.equal(isOwnedResumeStoragePath('alice', 'users/alice/chef-profile/resume-imports/../profile.jpg'), false);
  assert.equal(isOwnedResumeStoragePath('alice', 'users/alice/portfolio/resume/resume.pdf'), false);
});

test('resume drafts remain isolated across an A to B to A account switch', () => {
  const resumeA = {
    ...buildManagedResumeUpload('alice', {
      originalStoragePath: 'users/alice/chef-profile/resume-imports/resume.pdf',
      fileName: 'resume.pdf',
      contentType: 'application/pdf',
      fileSize: 2048
    }),
    draft: { ...draft, basicInfo: { ...draft.basicInfo, fullName: 'Alice Private Draft' } }
  };

  assert.equal(resolveOwnedManagedResume('alice', resumeA)?.draft?.basicInfo.fullName, 'Alice Private Draft');
  assert.throws(() => resolveOwnedManagedResume('bob', resumeA), /ownership mismatch/i);
  assert.equal(resolveOwnedManagedResume('bob', null), null);
  assert.equal(resolveOwnedManagedResume('alice', resumeA)?.draft?.basicInfo.fullName, 'Alice Private Draft');
});

test('legacy storage object names recover the original safe filename', () => {
  assert.equal(
    resumeFileNameFromObjectName('123e4567-e89b-12d3-a456-426614174000-Chef_Resume.pdf'),
    'Chef_Resume.pdf'
  );
  assert.equal(resumeFileNameFromObjectName('resume.pdf'), 'resume.pdf');
});

test('import summary exposes required counts and highlights missing sections', () => {
  const summary = getResumeImportSummary({
    ...draft,
    experiences: [{ id: 'experience-1', jobTitle: 'Chef', companyName: 'Kitchen', currentlyWorking: true }],
    education: [],
    skills: ['Food safety', 'Cost control'],
    languages: []
  });
  assert.deepEqual(summary, [
    { label: 'Experience imported', count: 1 },
    { label: 'Education imported', count: 0 },
    { label: 'Skills imported', count: 2 },
    { label: 'Languages imported', count: 0 }
  ]);
  assert.deepEqual(summary.filter(section => section.count === 0).map(section => section.label), [
    'Education imported', 'Languages imported'
  ]);
});

test('section confidence is deterministic and missing sections require review', () => {
  const assessed = assessResumeImport({
    ...draft,
    basicInfo: { ...draft.basicInfo, summary: 'Short summary.', email: 'chef@example.test' },
    experiences: [{ id: 'experience-1', jobTitle: 'Chef', companyName: 'Kitchen', currentlyWorking: false }],
    skills: ['Food safety', 'Cost control', 'Menu planning', 'Leadership', 'Inventory'],
    languages: []
  });
  assert.deepEqual(assessed.map(item => [item.key, item.confidence, item.status]), [
    ['experiences', 3, 'review'],
    ['education', 0, 'missing'],
    ['skills', 5, 'success'],
    ['languages', 0, 'missing'],
    ['summary', 3, 'review'],
    ['contact', 3, 'review']
  ]);
});

test('each section keeps existing data unless imported content is explicitly accepted', () => {
  const current = emptyChefProfile('alice', 'Chef Existing', 'existing@example.test');
  current.basicInfo.summary = 'Existing summary';
  current.basicInfo.phone = '+60 111 1111';
  current.experiences = [{ id: 'current-role', jobTitle: 'Current Chef', companyName: 'Current Kitchen', currentlyWorking: true }];
  current.education = [{ id: 'current-school', schoolName: 'Current School' }];
  current.skills = ['Existing skill'];
  current.languages = [{ id: 'current-language', language: 'English' }];
  const imported = {
    ...draft,
    basicInfo: { ...draft.basicInfo, summary: 'Imported summary', email: 'imported@example.test', phone: '+60 222 2222' },
    experiences: [{ id: 'imported-role', jobTitle: 'Imported Chef', companyName: 'Imported Kitchen', currentlyWorking: false }],
    education: [{ id: 'imported-school', schoolName: 'Imported School' }],
    skills: ['Imported skill'],
    languages: [{ id: 'imported-language', language: 'Malay' }]
  } satisfies ImportedChefProfile;
  const choices = defaultResumeReviewChoices(imported);
  choices.experiences = 'existing';
  choices.summary = 'existing';
  choices.contact = 'existing';

  const result = applyResumeReviewChoices(current, imported, choices);
  assert.equal(result.experiences[0].jobTitle, 'Current Chef');
  assert.equal(result.basicInfo.summary, 'Existing summary');
  assert.equal(result.basicInfo.email, 'existing@example.test');
  assert.equal(result.basicInfo.phone, '+60 111 1111');
  assert.equal(result.education[0].schoolName, 'Imported School');
  assert.deepEqual(result.skills, ['Imported skill']);
  assert.equal(result.languages[0].language, 'Malay');
  assert.equal(current.experiences[0].jobTitle, 'Current Chef');
});

test('resume errors identify the failed stage and provide a next action', () => {
  assert.equal(
    getResumeImportErrorMessage(new Error('Invalid PDF structure'), 'resume.pdf'),
    'Unable to read PDF. Make sure it contains selectable text, then retry or replace it.'
  );
  assert.equal(
    getResumeImportErrorMessage(new Error('Resume imported, but Education could not be identified. Retry the import or add Education manually.'), 'resume.pdf'),
    'Resume imported, but Education could not be identified. Retry the import or add Education manually.'
  );
  assert.equal(
    getResumeImportErrorMessage(new Error('The uploaded file is valid but requires manual review. Retry the import or replace the resume with a clearer copy.'), 'resume.pdf'),
    'The uploaded file is valid but requires manual review. Retry the import or replace the resume with a clearer copy.'
  );
  const callableError = Object.assign(new Error('Workspace subscription is temporarily unavailable.'), {
    code: 'functions/unavailable'
  });
  assert.equal(
    getResumeImportErrorMessage(callableError, 'resume.pdf'),
    'Workspace subscription is temporarily unavailable. (functions/unavailable)'
  );
  const geminiError = Object.assign(new Error('AI resume import failed. Please try again.'), {
    code: 'functions/internal'
  });
  assert.equal(
    getResumeImportErrorMessage(geminiError, 'resume.pdf'),
    'AI resume import failed. Please try again. (functions/internal)'
  );
});
