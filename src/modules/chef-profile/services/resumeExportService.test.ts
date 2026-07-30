import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildChefProfilePdf, createChefProfilePdfBlob, getResumeFileName } from './resumeExportService';
import type { ChefProfile, ResumeExportSettings } from '../types';

const profile: ChefProfile = {
  userId: 'chef-1',
  basicInfo: {
    fullName: 'Chef Cé Lim',
    professionalTitle: 'Executive Pastry Chef',
    location: 'Kuala Lumpur',
    country: 'Malaysia',
    email: 'chef@example.test',
    phone: '+60 12 345 6789',
    summary: 'Culinary professional focused on pastry, menu development, and kitchen leadership.'
  },
  skills: ['Pastry', 'Menu Development', 'Kitchen Management'],
  experiences: Array.from({ length: 18 }, (_, index) => ({
    id: `experience-${index}`,
    jobTitle: index === 0 ? 'Executive Pastry Chef' : 'Pastry Chef',
    companyName: `Hotel ${index + 1}`,
    startYear: String(2005 + index),
    endYear: String(2006 + index),
    currentlyWorking: index === 0,
    description: 'Led pastry production, recipe development, training, and service quality.'
  })),
  education: [{
    id: 'education-1',
    schoolName: 'Culinary Academy',
    qualification: 'Diploma in Culinary Arts',
    startYear: '2003',
    endYear: '2005'
  }],
  certificates: [{
    id: 'certificate-1',
    name: 'HACCP',
    issuingOrganisation: 'Training Organisation',
    issueDate: '2025-01-01'
  }],
  awards: [{
    id: 'award-1',
    name: 'Pastry Chef of the Year',
    issuingOrganisation: 'Culinary Association',
    year: '2024'
  }],
  languages: [{ id: 'language-1', language: 'English', proficiency: 'Professional' }],
  socialLinks: { website: 'https://example.test/chef' },
  portfolio: [],
  visibility: 'public',
  profileSlug: 'chef-ce-lim',
  completionPercentage: 90
};

const settings: ResumeExportSettings = {
  includeProfilePhoto: false,
  includeEmail: true,
  includePhone: true,
  includeLocation: true,
  includeCertificates: true,
  includeAwards: true,
  includePortfolioLink: true,
  includeMiseChefProfileLink: true
};

test('builds a valid selectable multipage PDF document', async () => {
  const bytes = await buildChefProfilePdf(profile, settings);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 2_000);

  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 2);
  assert.equal(document.getTitle(), 'Chef Cé Lim - Resume');
  assert.equal(document.getCreator(), 'MiseChef');
});

test('creates an application/pdf Blob with real PDF bytes', async () => {
  const blob = await createChefProfilePdfBlob(profile, settings);
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 2_000);
  assert.equal(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5)), '%PDF-');
});

test('uses a portable download filename', () => {
  assert.equal(getResumeFileName(profile), 'chef-ce-lim-resume.pdf');
});
