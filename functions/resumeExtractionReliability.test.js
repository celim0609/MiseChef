import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResumeRetryInstruction,
  extractResumeWithCompletenessRetry,
  findResumeSectionHeadings,
  isValidResumePhone,
  isValidYearsExperience,
  recoverResumeExtraction,
  ResumeExtractionIncompleteError,
  validateResumeExtraction
} from './resumeExtractionReliability.js';

const completeArrays = {
  basicProfile: {},
  about: {},
  experience: [{}],
  education: [{}],
  skills: [{}],
  languages: [{}],
  certificates: [],
  awards: [],
  projects: [],
  unmappedSections: [],
  socialLinks: {},
  contact: {}
};

test('detects conventional and letter-spaced resume section headings', () => {
  const text = [
    'P R O F E S S I O N A L   E X P E R I E N C E',
    'E D U C A T I O N',
    'TECHNICAL SKILLS',
    'L',
    'A',
    'N',
    'G',
    'U',
    'A',
    'G',
    'E',
    'S'
  ].join('\n');

  assert.deepEqual(
    findResumeSectionHeadings(text).sort(),
    ['education', 'experience', 'languages', 'skills'].sort()
  );
});

test('rejects an omitted required top-level array before sanitization', () => {
  const { skills, ...withoutSkills } = completeArrays;
  const validation = validateResumeExtraction('WORK EXPERIENCE\nChef', withoutSkills);

  assert.equal(validation.complete, false);
  assert.deepEqual(validation.missingFields, ['skills']);
});

test('rejects empty experience when a supported experience heading exists', () => {
  const validation = validateResumeExtraction('Employment History\nHotel\nChef\n2020 - Present', {
    ...completeArrays,
    experience: []
  });

  assert.equal(validation.complete, false);
  assert.deepEqual(validation.emptyDetectedSections, ['experience']);
  assert.match(buildResumeRetryInstruction(validation), /re-scan the ENTIRE resume/i);
});

test('allows empty arrays for sections that are not present in the resume', () => {
  const validation = validateResumeExtraction('Chef focused on seasonal menus.', {
    ...completeArrays,
    experience: [],
    education: [],
    skills: [],
    languages: []
  });

  assert.equal(validation.complete, true);
});

test('detects missing entries across experience, education, languages, skills, and summary', () => {
  const resumeText = `
PROFESSIONAL SUMMARY
Chef with experience leading high-volume kitchens.

WORK EXPERIENCE
First Hotel
Executive Chef
2022 - Present
Second Restaurant
Sous Chef
2020 - 2022
Third Bistro
Chef de Partie
2018 - 2020

EDUCATION
Culinary Institute
2016 - 2018
Hospitality College
2014 - 2016

LANGUAGES
English
Malay
Mandarin

TECHNICAL SKILLS
Menu Development
Food Costing
Kitchen Leadership
`;
  const validation = validateResumeExtraction(resumeText, {
    ...completeArrays,
    basicProfile: {},
    experience: [{}],
    education: [{}],
    languages: [{}],
    skills: [{}]
  });

  assert.equal(validation.complete, false);
  assert.deepEqual(validation.expectedCounts, {
    experience: 3,
    education: 2,
    languages: 3,
    skills: 3,
    certificates: 0,
    awards: 0,
    projects: 0
  });
  assert.deepEqual(
    validation.incompleteSections.map(section => section.field),
    ['experience', 'education', 'languages', 'skills']
  );
  assert.deepEqual(validation.missingContent, ['summary']);
});

test('rejects cross-field corruption in yearsExperience', () => {
  const validation = validateResumeExtraction('Chef profile', {
    ...completeArrays,
    basicProfile: {
      yearsExperience: '12 years ' + 'Entire resume content was incorrectly copied here. '.repeat(4)
    }
  });

  assert.equal(validation.complete, false);
  assert.deepEqual(validation.corruptFields, ['basicProfile.yearsExperience']);
});

test('recovers source summary, phone, location, achievements, and explicit years without inventing content', () => {
  const resumeText = `
PERSONAL PROFILE
Chef with over 12 years of experience leading professional kitchens.

CONTACT INFORMATION
+65 8123-4567
12 Example Road
Singapore 123456

KEY ACHIEVEMENTS
Reduced kitchen waste by 20%.
Led a successful opening team.

WORK EXPERIENCE
Example Hotel
Executive Chef
2018 - Present
`;
  const recovered = recoverResumeExtraction(resumeText, {
    ...completeArrays,
    basicProfile: { yearsExperience: 'Chef with over 12 years ' + 'resume text '.repeat(20) },
    about: {},
    awards: [],
    contact: {}
  });

  assert.equal(recovered.basicProfile.shortBio, 'Chef with over 12 years of experience leading professional kitchens.');
  assert.equal(recovered.basicProfile.yearsExperience, 'over 12 years');
  assert.equal(recovered.contact.phone, '+65 8123-4567');
  assert.equal(recovered.contact.location, '12 Example Road, Singapore 123456');
  assert.equal(recovered.awards.length, 2);
  assert.equal(recovered.awards[0].name, 'Reduced kitchen waste by 20%.');
});

test('derives yearsExperience from valid experience date ranges when summary has no duration', () => {
  const currentYear = new Date().getUTCFullYear();
  const recovered = recoverResumeExtraction(`
WORK EXPERIENCE
Example Hotel
Chef
2018 - Present
`, {
    ...completeArrays,
    basicProfile: { yearsExperience: 'polluted resume paragraph '.repeat(10) }
  });

  assert.equal(recovered.basicProfile.yearsExperience, `${currentYear - 2018} years`);
});

test('does not detect dates, postal codes, or identification values as phone numbers', () => {
  const recovered = recoverResumeExtraction(`
CONTACT
Postal code 79100
Passport 123456789
EDUCATION
2004 - 2010
`, {
    ...completeArrays,
    contact: {}
  });

  assert.equal(recovered.contact.phone, '');
  assert.equal(isValidResumePhone('2004 - 2010'), false);
  assert.equal(isValidResumePhone('79100'), false);
});

test('preserves stronger valid Gemini values and appends source-only achievements', () => {
  const recovered = recoverResumeExtraction(`
PROFILE
Source profile that should not replace a valid structured summary.
CONTACT
+60 12-345 6789
Source Address
ACHIEVEMENTS
Source achievement.
`, {
    ...completeArrays,
    basicProfile: {
      shortBio: 'Validated Gemini summary remains authoritative.',
      yearsExperience: 12
    },
    contact: {
      phone: '+65 9000 0000',
      location: 'Validated Gemini Location'
    },
    awards: [{ name: 'Validated Gemini Award' }]
  });

  assert.equal(recovered.basicProfile.shortBio, 'Validated Gemini summary remains authoritative.');
  assert.equal(recovered.basicProfile.yearsExperience, '12');
  assert.equal(recovered.contact.phone, '+65 9000 0000');
  assert.equal(recovered.contact.location, 'Validated Gemini Location');
  assert.equal(recovered.awards[0].name, 'Validated Gemini Award');
  assert.equal(recovered.awards[1].name, 'Source achievement.');
  assert.equal(isValidYearsExperience(recovered.basicProfile.yearsExperience), true);
});

test('passes final completeness validation after deterministic recovery', () => {
  const resumeText = `
PROFESSIONAL SUMMARY
Chef with over 10 years of professional kitchen experience.
CONTACT
+60 (12) 345-6789
Kuala Lumpur, Malaysia
WORK EXPERIENCE
First Hotel
Executive Chef
2022 - Present
Second Hotel
Sous Chef
2018 - 2022
EDUCATION
Culinary Institute
2016 - 2018
LANGUAGES
English
Malay
SKILLS
Menu Development
Food Costing
KEY ACHIEVEMENTS
Improved food-cost controls.
`;
  const recovered = recoverResumeExtraction(resumeText, {
    ...completeArrays,
    basicProfile: { yearsExperience: 'polluted '.repeat(30) },
    experience: [{}, {}],
    education: [{}],
    languages: [{}, {}],
    skills: [{}, {}],
    awards: [],
    contact: {}
  });

  assert.equal(validateResumeExtraction(resumeText, recovered).complete, true);
});

test('retries an incomplete extraction once and returns the complete retry', async () => {
  const results = [
    { parsed: { ...completeArrays, languages: [{}] } },
    { parsed: { ...completeArrays, languages: [{}, {}] } }
  ];
  const retryInstructions = [];

  const result = await extractResumeWithCompletenessRetry({
    resumeText: 'WORK EXPERIENCE\nFirst Hotel\nChef\n2020 - Present\nSecond Hotel\nChef\n2018 - 2020\nLANGUAGES\nEnglish\nMalay',
    extract: async retryInstruction => {
      retryInstructions.push(retryInstruction);
      return results.shift();
    }
  });

  assert.equal(result.parsed.experience.length, 2);
  assert.equal(result.parsed.languages.length, 2);
  assert.equal(retryInstructions.length, 2);
  assert.equal(retryInstructions[0], '');
  assert.match(retryInstructions[1], /previous extraction was incomplete/i);
});

test('throws after two incomplete extraction attempts', async () => {
  let attempts = 0;

  await assert.rejects(
    extractResumeWithCompletenessRetry({
      resumeText: 'CAREER HISTORY\nHotel\nChef\n2020 - Present\nLANGUAGES\nEnglish\nMalay',
      extract: async () => {
        attempts += 1;
        return { parsed: { ...completeArrays, languages: [] } };
      }
    }),
    error => (
      error instanceof ResumeExtractionIncompleteError &&
      error.message === 'AI extraction incomplete.' &&
      error.validation.emptyDetectedSections.includes('languages')
    )
  );
  assert.equal(attempts, 2);
});
