import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { normalizeResumePortfolioDraft } from '../../../services/resumePortfolioModel';
import {
  recoverResumeExtraction,
  validateResumeExtraction
} from '../../../../functions/resumeExtractionReliability.js';
import {
  reconstructSourceExperiences,
  validateEmploymentAssociations
} from '../../../../functions/resumeEmploymentRecovery.js';
import { sanitizeProfile } from '../model';
import { mapResumeDraftToChefProfile } from './resumeImportMapping';
import { ResumeImportError } from './resumeImportErrors';
import { parseExtractedResumeText } from './resumeParsing';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
if (!('toHex' in Uint8Array.prototype)) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array) {
      return Array.from(this, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  });
}
const { extractChefResumeText, extractPdfResumeText } = await import('./resumeTextExtraction');

const makePdf = async (pages: string[]) => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  pages.forEach(content => {
    const page = document.addPage([595, 842]);
    content.split('\n').forEach((line, index) => page.drawText(line, {
      x: 50,
      y: 790 - index * 20,
      size: 12,
      font
    }));
  });
  return new File([await document.save()], 'generated-resume.pdf', { type: 'application/pdf' });
};

const assertResumeErrorCode = async (operation: Promise<unknown>, code: ResumeImportError['code']) => {
  await assert.rejects(operation, error => error instanceof ResumeImportError && error.code === code);
};

test('extracts a valid text PDF through the canonical PDF.js path', async () => {
  const text = await extractChefResumeText(await makePdf([
    'CHEF ADA TEST\nExecutive Chef\nWORK EXPERIENCE\nExample Kitchen 2020 - Present\nMenu development and kitchen leadership.'
  ]));

  assert.match(text, /CHEF ADA TEST/);
  assert.match(text, /WORK EXPERIENCE/);
  assert.match(text, /Menu development and kitchen leadership/);
});

test('extracts every page of a multi-page text PDF with an explicit page boundary', async () => {
  const text = await extractChefResumeText(await makePdf([
    'CHEF ADA TEST\nPROFESSIONAL SUMMARY\nModern Malaysian cuisine specialist.',
    'WORK EXPERIENCE\nExample Kitchen\nExecutive Chef\n2020 - Present',
    'EDUCATION\nCulinary Academy\nDiploma in Culinary Arts'
  ]));

  assert.match(text, /PROFESSIONAL SUMMARY/);
  assert.match(text, /WORK EXPERIENCE/);
  assert.match(text, /EDUCATION/);
  assert.equal(text.match(/--- PAGE BREAK ---/g)?.length, 2);
});

test('classifies an empty or image-only PDF as empty text', async () => {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  const file = new File([await document.save()], 'image-only.pdf', { type: 'application/pdf' });

  await assertResumeErrorCode(extractChefResumeText(file), 'pdf_empty_text');
});

test('classifies an invalid or corrupted PDF as a parsing failure', async () => {
  const file = new File([new TextEncoder().encode('not a PDF document')], 'corrupted.pdf', { type: 'application/pdf' });
  await assert.rejects(extractChefResumeText(file), error => (
    error instanceof ResumeImportError
    && error.stage === 'pdf-parse'
    && ['pdf_invalid', 'pdf_corrupted', 'pdf_parse_failed'].includes(error.code)
  ));
});

test('does not misclassify a worker configuration failure as empty text', async () => {
  const file = await makePdf(['CHEF ADA TEST\nExecutive Chef']);
  const failingRuntime = async () => {
    throw new Error('Setting up fake worker failed: No GlobalWorkerOptions.workerSrc specified.');
  };

  await assertResumeErrorCode(extractPdfResumeText(file, failingRuntime as never), 'pdf_worker_failed');
});

test('does not blame extraction when the downstream resume parser fails', async () => {
  const text = 'CHEF ADA TEST\nExecutive Chef\nWORK EXPERIENCE\nExample Kitchen\n2020 - Present\n'.repeat(3);
  await assertResumeErrorCode(parseExtractedResumeText(text, 'workspace-test', async () => {
    throw new Error('AI response schema was invalid.');
  }), 'resume_parser_failed');
});

test('classifies a downstream resume parser network failure separately', async () => {
  const text = 'CHEF ADA TEST\nExecutive Chef\nWORK EXPERIENCE\nExample Kitchen\n2020 - Present\n'.repeat(3);
  await assertResumeErrorCode(parseExtractedResumeText(text, 'workspace-test', async () => {
    const error = new Error('The callable service is unavailable.');
    Object.assign(error, { code: 'functions/unavailable' });
    throw error;
  }), 'resume_parser_network_failed');
});

test('a valid PDF succeeds when retried after a failed PDF', async () => {
  const invalid = new File([new Uint8Array([0, 1, 2, 3])], 'invalid.pdf', { type: 'application/pdf' });
  await assert.rejects(extractChefResumeText(invalid), ResumeImportError);

  const text = await extractChefResumeText(await makePdf([
    'CHEF RETRY TEST\nSous Chef\nSKILLS\nFood safety\nCost control\nKitchen leadership'
  ]));
  assert.match(text, /CHEF RETRY TEST/);
});

test('the upload and review handlers do not save Chef Profile data before final confirmation', async () => {
  const source = await readFile(new URL('../ChefProfilePage.tsx', import.meta.url), 'utf8');
  const importHandler = source.slice(source.indexOf('const handleResume'), source.indexOf('const confirmImport'));
  const reviewHandler = source.slice(source.indexOf('const confirmImport'), source.indexOf('const cancelImport'));

  assert.doesNotMatch(importHandler, /chefProfileService\.save/);
  assert.doesNotMatch(reviewHandler, /chefProfileService\.save/);
  assert.match(reviewHandler, /setPendingResumeImport\(true\)/);
});

test('resume review exposes selected choices and a clear apply action', async () => {
  const source = await readFile(new URL('../ChefProfilePage.tsx', import.meta.url), 'utf8');
  const review = source.slice(source.indexOf('function ImportReview'), source.indexOf('function ExportModal'));

  assert.match(review, /role="group" aria-label={`\$\{section\.label\} import choice`}/);
  assert.match(review, /aria-pressed=\{importedSelected\}/);
  assert.match(review, /aria-pressed=\{!importedSelected\}/);
  assert.match(review, /importedSelected \? '✓ Accepted' : 'Accept Imported'/);
  assert.match(review, /disabled=\{section\.status === 'missing'\}/);
  assert.match(review, />Apply Selections &amp; Continue<\/button>/);
  assert.match(review, /onClick=\{onConfirm\}/);
  assert.doesNotMatch(review, /chefProfileService\.save/);
});

const completeResumeResponse = {
  basicProfile: {
    fullName: 'Chef Ada Wong',
    professionalTitle: 'Executive Chef',
    shortBio: 'Chef focused on modern Malaysian cuisine.',
    location: 'Kuala Lumpur'
  },
  experience: [{
    role: 'Executive Chef',
    organization: 'Example Hotel',
    startDate: 'January 2020',
    endDate: 'Present',
    isCurrent: true,
    description: 'Led culinary operations.'
  }],
  skills: [{ name: 'Menu Development' }],
  certificates: [{ title: 'HACCP', issuer: 'Food Safety Council' }],
  education: [{
    degree: 'Diploma in Culinary Arts',
    field: 'Culinary Arts',
    graduationYear: '2018'
  }],
  awards: [{ name: 'Chef of the Year', issuingOrganisation: 'Chefs Association', year: '2024' }],
  languages: [{ language: 'English', proficiency: 'Professional' }],
  projects: [{
    title: 'Zero-waste Tasting Menu',
    role: 'Project Lead',
    description: 'Created a seasonal tasting menu.',
    url: 'https://example.test/project'
  }],
  contact: {
    email: 'ada@example.test',
    phone: '+60 12 345 6789'
  },
  unmappedSections: [{
    sectionName: 'Volunteer Service',
    content: 'Community kitchen mentor',
    reason: 'No supported Chef Profile field'
  }]
};

const readResumeFixture = async (name: string) => {
  const bytes = await readFile(new URL(`../../../../tests/fixtures/resume-import/${name}`, import.meta.url));
  return new File([bytes], name, { type: 'application/pdf' });
};

test('extracts every required section and all work entries from the primary real resume', async () => {
  const text = await extractChefResumeText(await readResumeFixture('low-wai-leong-primary.pdf'));
  const compactText = text.replace(/\s+/g, '').toUpperCase();

  assert.ok(text.length > 3_400);
  ['PROFILE', 'EDUCATION', 'LANGUAGE', 'TECHNICALSKILLS', 'CONTACTME', 'WORKEXPERIENCE']
    .forEach(heading => assert.ok(compactText.includes(heading), `missing extracted heading: ${heading}`));
  [
    'WAI LEONG',
    'Junior Sous Chef',
    'Owner & Head Chef',
    'Chef De Partie',
    'COOK',
    'Demi Chef',
    'Cook 1',
    "Elsie's Kitchen Catering Service Pte Ltd",
    'RichBox',
    '128 Restaurant',
    'Singapore Island Country Club'
  ].forEach(expected => assert.ok(text.includes(expected), `missing extracted text: ${expected}`));
  assert.equal(text.match(/META Cafeteria/g)?.length, 2);
  const orderedRoles = [
    'Junior Sous Chef May 2026',
    'Owner & Head Chef',
    'Chef De Partie',
    'COOK',
    'Demi Chef',
    'Cook 1'
  ];
  orderedRoles.reduce((previousIndex, role) => {
    const index = text.indexOf(role);
    assert.ok(index > previousIndex, `work entry is out of visual order: ${role}`);
    return index;
  }, text.indexOf('Work Experience'));

  const sourceExperiences = reconstructSourceExperiences(text);
  assert.equal(sourceExperiences.length, 6);
  assert.deepEqual(sourceExperiences.map(experience => ({
    company: experience.company,
    title: experience.title,
    startDate: experience.startDate,
    endDate: experience.endDate,
    location: experience.location
  })), [
    {
      company: "Elsie's Kitchen Catering Service Pte Ltd",
      title: 'Junior Sous Chef',
      startDate: 'May 2026',
      endDate: 'Present',
      location: 'Singapore'
    },
    {
      company: 'RichBox 暴富茶铺',
      title: 'Owner & Head Chef',
      startDate: 'November 2025',
      endDate: 'May 2026',
      location: 'Malaysia'
    },
    {
      company: 'META Cafeteria',
      title: 'Chef De Partie',
      startDate: '2021',
      endDate: 'Oct 2025',
      location: ''
    },
    {
      company: 'META Cafeteria',
      title: 'COOK',
      startDate: '2018',
      endDate: '2020',
      location: ''
    },
    {
      company: '128 Restaurant',
      title: 'Demi Chef',
      startDate: '2016',
      endDate: '2018',
      location: 'Malaysia'
    },
    {
      company: 'Singapore Island Country Club',
      title: 'Cook 1',
      startDate: '2013',
      endDate: '2016',
      location: 'Singapore'
    }
  ]);
  [
    'Assist the Sous Chef in managing daily kitchen operations.',
    'Founded and managed a takeaway food and beverage business.',
    'Assisted the head chef in developing new dishes and menu items.',
    'Support the head chef and sous chef in the kitchen',
    'Assisted in meal preparation and daily kitchen operations.',
    'Prepared dishes for members and guests.'
  ].forEach((description, index) => {
    assert.ok(sourceExperiences[index].description.includes(description));
  });
  assert.doesNotMatch(sourceExperiences[0].description, /Founded and managed/);
  assert.doesNotMatch(sourceExperiences[1].description, /Assisted the head chef/);
  assert.equal(new Set(sourceExperiences.map(experience => (
    `${experience.company}|${experience.title}|${experience.startDate}|${experience.endDate}`
  ))).size, 6);

  const recovered = recoverResumeExtraction(text, {
    ...completeResumeResponse,
    basicProfile: {
      fullName: 'WAI LEONG LOW',
      professionalTitle: 'Junior Sous Chef',
      shortBio: '',
      yearsExperience: 'Polluted resume content '.repeat(30)
    },
    about: {},
    experience: Array.from({ length: 6 }, (_, index) => ({ role: `Role ${index + 1}` })),
    education: [{ schoolName: 'SMK Seri Keledang' }],
    languages: ['English', 'Mandarin', 'Cantonese', 'Malay'].map(language => ({ language })),
    skills: Array.from({ length: 6 }, (_, index) => ({ name: `Skill ${index + 1}` })),
    awards: [],
    contact: { email: 'chef@example.test', phone: '', location: '' },
    socialLinks: {}
  });
  const validation = validateResumeExtraction(text, recovered);
  assert.equal(validation.complete, true);
  assert.equal(validation.expectedCounts.experience, 6);
  assert.equal(validation.expectedCounts.education, 1);
  assert.equal(validation.expectedCounts.languages, 4);
  assert.equal(validation.expectedCounts.skills, 6);
  assert.equal(recovered.basicProfile.shortBio?.startsWith('Passionate culinary professional with over 12 years'), true);
  assert.equal(recovered.basicProfile.yearsExperience, 'over 12 years');
  assert.equal(recovered.contact.phone, '65 84357277');
  assert.equal(recovered.contact.location?.includes('Johor, Malaysia'), true);
  assert.equal(recovered.awards.length, 4);
  assert.equal(validateEmploymentAssociations(text, recovered.experience).complete, true);
  assert.deepEqual(
    recovered.experience.map(experience => experience.organization),
    sourceExperiences.map(experience => experience.company)
  );
  const recoveredImport = mapResumeDraftToChefProfile(normalizeResumePortfolioDraft(recovered));
  assert.equal(recoveredImport.basicInfo.summary.startsWith('Passionate culinary professional'), true);
  assert.equal(recoveredImport.basicInfo.phone, '65 84357277');
  assert.equal(recoveredImport.basicInfo.location.includes('Johor, Malaysia'), true);
  assert.equal(recoveredImport.awards.length, 4);
});

test('extracts every required section and all five work entries from the secondary real resume', async () => {
  const text = await extractChefResumeText(await readResumeFixture('celim-resume.pdf'));

  assert.ok(text.length > 2_600);
  [
    'CE LIM CHAN',
    'Food Operations | Menu Development | Cost Control',
    'SUMMARY',
    'SKILLS',
    'WORK EXPERIENCE',
    'CERTIFICATIONS',
    'LANGUAGES',
    'EDUCATION',
    'Tots & Teddies',
    'META Cafeteria',
    'XiaowuKitchen',
    'The English House',
    'Majestic Restaurant'
  ].forEach(expected => assert.ok(text.includes(expected), `missing extracted text: ${expected}`));
});

test('normalizes every supported resume section and preserves unknown sections', () => {
  const normalized = normalizeResumePortfolioDraft(completeResumeResponse);

  assert.equal(normalized.basicProfile?.fullName, 'Chef Ada Wong');
  assert.equal(normalized.basicProfile?.professionalTitle, 'Executive Chef');
  assert.equal(normalized.basicProfile?.shortBio, 'Chef focused on modern Malaysian cuisine.');
  assert.equal(normalized.experience?.length, 1);
  assert.equal(normalized.skills?.length, 1);
  assert.equal(normalized.certificates?.length, 1);
  assert.equal(normalized.education?.[0]?.qualification, 'Diploma in Culinary Arts');
  assert.equal(normalized.education?.[0]?.schoolName, '');
  assert.equal(normalized.awards?.length, 1);
  assert.equal(normalized.languages?.length, 1);
  assert.equal(normalized.projects?.length, 1);
  assert.equal(normalized.contact?.email, 'ada@example.test');
  assert.equal(normalized.unmappedSections?.[0]?.sectionName, 'Volunteer Service');
});

test('maps all extracted sections into a Chef Profile import draft', () => {
  const imported = mapResumeDraftToChefProfile(normalizeResumePortfolioDraft(completeResumeResponse));

  assert.equal(imported.basicInfo.fullName, 'Chef Ada Wong');
  assert.equal(imported.experiences.length, 1);
  assert.equal(imported.skills.length, 1);
  assert.equal(imported.certificates.length, 1);
  assert.equal(imported.education.length, 1);
  assert.equal(imported.education[0].qualification, 'Diploma in Culinary Arts');
  assert.equal(imported.awards.length, 1);
  assert.equal(imported.languages.length, 1);
  assert.equal(imported.portfolio.length, 1);
  assert.equal(imported.portfolio[0].projectUrl, 'https://example.test/project');
  assert.equal(imported.unmappedSections?.length, 1);
});

test('Firestore-bound profile sanitization retains qualification-only education and projects', () => {
  const imported = mapResumeDraftToChefProfile(normalizeResumePortfolioDraft(completeResumeResponse));
  const clean = sanitizeProfile({
    ...imported,
    userId: 'chef-ada',
    visibility: 'private',
    completionPercentage: 0
  });

  assert.equal(clean.education.length, 1);
  assert.equal(clean.education[0].qualification, 'Diploma in Culinary Arts');
  assert.equal(clean.portfolio.length, 1);
  assert.equal(clean.portfolio[0].title, 'Zero-waste Tasting Menu');
  assert.equal(clean.portfolio[0].projectUrl, 'https://example.test/project');
});
