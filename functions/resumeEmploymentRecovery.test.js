import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSourceExperiences,
  reconstructSourceExperiences,
  scoreExperienceMatch,
  validateEmploymentAssociations
} from './resumeEmploymentRecovery.js';

const twoRoleResume = `
WORK EXPERIENCE

First Hotel, Singapore
Executive Chef January 2022 - Present
Led daily service.
Managed menu development across several outlets.

Second Restaurant
Sous Chef 2018 - December 2021
Managed preparation.
Maintained food safety standards.
`;

const missingTitleResume = `
WORK EXPERIENCE
Example Hotel
(Singapore) 2020 - 2022
Prepared daily service.
`;

const missingCompanyResume = `
WORK EXPERIENCE
Executive Chef 2020 - 2022
Prepared daily service.
`;

test('reconstructs ordered employment blocks with bounded multi-line descriptions', () => {
  const experiences = reconstructSourceExperiences(twoRoleResume);

  assert.equal(experiences.length, 2);
  assert.deepEqual(experiences[0], {
    title: 'Executive Chef',
    company: 'First Hotel',
    startDate: 'January 2022',
    endDate: 'Present',
    location: 'Singapore',
    description: 'Led daily service.\nManaged menu development across several outlets.',
    achievements: [],
    sourceLineRange: { start: 3, end: 6 },
    sourcePage: 1
  });
  assert.equal(experiences[1].title, 'Sous Chef');
  assert.equal(experiences[1].company, 'Second Restaurant');
  assert.match(experiences[1].description, /^Managed preparation\./);
  assert.doesNotMatch(experiences[0].description, /Second Restaurant|Managed preparation/);
});

test('handles page boundaries without merging adjacent roles', () => {
  const experiences = reconstructSourceExperiences(`
WORK EXPERIENCE
First Hotel
Chef 2020 - 2022
First description.
--- PAGE BREAK ---
Second Hotel
Cook 2018 - 2020
Second description.
`);

  assert.equal(experiences.length, 2);
  assert.equal(experiences[0].sourcePage, 1);
  assert.equal(experiences[1].sourcePage, 2);
  assert.equal(experiences[0].description, 'First description.');
  assert.equal(experiences[1].description, 'Second description.');
});

test('uses a confidently matched Gemini entry only for non-structural enrichment', () => {
  const merged = mergeSourceExperiences(twoRoleResume, [{
    role: 'Executive Chef',
    organization: 'First Hotel',
    location: 'Singapore',
    startDate: 'January 2022',
    endDate: 'Present',
    employmentType: 'Full-time',
    description: 'AI summary that must not replace the source responsibilities.'
  }]);

  assert.equal(merged[0].employmentType, 'Full-time');
  assert.equal(merged[0].description, 'Led daily service.\nManaged menu development across several outlets.');
});

test('rejects a low-confidence Gemini mismatch and keeps the deterministic source block', () => {
  const merged = mergeSourceExperiences(twoRoleResume, [{
    role: 'Pastry Intern',
    organization: 'Unrelated Bakery',
    startDate: '2010',
    endDate: '2011',
    description: 'Prepared desserts.'
  }]);

  assert.equal(merged[0].role, 'Executive Chef');
  assert.equal(merged[0].organization, 'First Hotel');
  assert.equal(merged[0].employmentType, '');
  assert.equal(merged[0].matchConfidence, 0);
});

test('requires multiple matching signals before accepting a Gemini entry', () => {
  const source = reconstructSourceExperiences(twoRoleResume)[0];
  const confidence = scoreExperienceMatch(source, {
    role: 'Executive Chef',
    organization: 'Different Company',
    startDate: '2010',
    endDate: '2011',
    description: 'Unrelated work.'
  }, 0, 0, 2);

  assert.equal(confidence.strongSignals, 1);
  assert.ok(confidence.score < 0.55);
});

test('release validation rejects duplicate, reordered, or bleeding descriptions', () => {
  const valid = mergeSourceExperiences(twoRoleResume, []);
  assert.equal(validateEmploymentAssociations(twoRoleResume, valid).complete, true);

  const invalid = [
    { ...valid[1], description: `${valid[1].description}\n${valid[0].description}` },
    { ...valid[1] }
  ];
  const result = validateEmploymentAssociations(twoRoleResume, invalid);
  assert.equal(result.complete, false);
  assert.ok(result.issues.some(issue => issue.includes('title')));
  assert.ok(result.issues.some(issue => issue.includes('description')));
  assert.ok(result.issues.some(issue => issue.includes('duplicate')));
});

test('accepts a populated Gemini title when deterministic reconstruction has no title evidence', () => {
  const expected = reconstructSourceExperiences(missingTitleResume);
  assert.equal(expected[0].title, '');
  assert.equal(expected[0].company, 'Example Hotel');

  const recovered = mergeSourceExperiences(missingTitleResume, [{
    role: 'Sous Chef',
    organization: 'Example Hotel',
    location: 'Singapore',
    startDate: '2020',
    endDate: '2022',
    description: 'Prepared daily service.'
  }]);

  assert.equal(recovered[0].role, 'Sous Chef');
  assert.equal(validateEmploymentAssociations(missingTitleResume, recovered).complete, true);
});

test('accepts a populated Gemini company when deterministic reconstruction has no company evidence', () => {
  const expected = reconstructSourceExperiences(missingCompanyResume);
  assert.equal(expected[0].title, 'Executive Chef');
  assert.equal(expected[0].company, '');

  const recovered = mergeSourceExperiences(missingCompanyResume, [{
    role: 'Executive Chef',
    organization: 'Example Hotel',
    startDate: '2020',
    endDate: '2022',
    description: 'Prepared daily service.'
  }]);

  assert.equal(recovered[0].organization, 'Example Hotel');
  assert.equal(validateEmploymentAssociations(missingCompanyResume, recovered).complete, true);
});

test('preserves strict title validation when deterministic title evidence exists', () => {
  const valid = mergeSourceExperiences(twoRoleResume, []);
  assert.equal(validateEmploymentAssociations(twoRoleResume, valid).complete, true);

  const conflicting = [{ ...valid[0], role: 'Pastry Intern' }, valid[1]];
  const result = validateEmploymentAssociations(twoRoleResume, conflicting);
  assert.equal(result.complete, false);
  assert.ok(result.issues.includes('experience-0-title'));
});

test('preserves strict company validation when deterministic company evidence exists', () => {
  const valid = mergeSourceExperiences(twoRoleResume, []);
  const conflicting = [{ ...valid[0], organization: 'Unrelated Bakery' }, valid[1]];
  const result = validateEmploymentAssociations(twoRoleResume, conflicting);

  assert.equal(result.complete, false);
  assert.ok(result.issues.includes('experience-0-company'));
});

test('preserves Gemini experiences when no deterministic work section is detectable', () => {
  const gemini = [{
    role: 'Chef',
    organization: 'Example Hotel',
    startDate: '2020',
    endDate: '2022',
    description: 'Prepared daily service.'
  }];

  assert.equal(mergeSourceExperiences('General chef biography without section headings.', gemini), gemini);
  assert.equal(
    validateEmploymentAssociations('General chef biography without section headings.', gemini).complete,
    true
  );
});
