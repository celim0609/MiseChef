import {
  mergeSourceExperiences,
  validateEmploymentAssociations
} from './resumeEmploymentRecovery.js';

const REQUIRED_TOP_LEVEL_FIELDS = {
  basicProfile: 'object',
  about: 'object',
  experience: 'array',
  education: 'array',
  skills: 'array',
  languages: 'array',
  certificates: 'array',
  awards: 'array',
  projects: 'array',
  unmappedSections: 'array',
  socialLinks: 'object',
  contact: 'object'
};

const SECTION_HEADINGS = [
  {
    field: 'summary',
    labels: [
      'PROFILE',
      'PERSONALPROFILE',
      'PROFESSIONALPROFILE',
      'SUMMARY',
      'CAREERSUMMARY',
      'PROFESSIONALSUMMARY',
      'ABOUT',
      'ABOUTME',
      'OBJECTIVE'
    ]
  },
  {
    field: 'contact',
    labels: ['CONTACT', 'CONTACTME', 'CONTACTINFORMATION', 'PERSONALDETAILS']
  },
  {
    field: 'experience',
    labels: ['WORKEXPERIENCE', 'EMPLOYMENTHISTORY', 'PROFESSIONALEXPERIENCE', 'CAREERHISTORY', 'EXPERIENCE']
  },
  {
    field: 'education',
    labels: ['EDUCATION', 'ACADEMICBACKGROUND', 'ACADEMICHISTORY', 'QUALIFICATIONS']
  },
  {
    field: 'skills',
    labels: ['SKILLS', 'TECHNICALSKILLS', 'CORECOMPETENCIES', 'EXPERTISE']
  },
  {
    field: 'languages',
    labels: ['LANGUAGE', 'LANGUAGES']
  },
  {
    field: 'certificates',
    labels: ['CERTIFICATE', 'CERTIFICATES', 'CERTIFICATION', 'CERTIFICATIONS', 'LICENSESANDCERTIFICATIONS']
  },
  {
    field: 'awards',
    labels: ['AWARD', 'AWARDS', 'HONOURS', 'HONORS']
  },
  {
    field: 'achievements',
    labels: [
      'ACHIEVEMENT',
      'ACHIEVEMENTS',
      'KEYACHIEVEMENTS',
      'ACCOMPLISHMENT',
      'ACCOMPLISHMENTS',
      'AWARDSANDACHIEVEMENTS',
      'CAREERHIGHLIGHTS'
    ]
  },
  {
    field: 'projects',
    labels: ['PROJECT', 'PROJECTS', 'PORTFOLIO', 'SELECTEDPROJECTS']
  },
  {
    field: 'additional',
    labels: ['ADDITIONALINFORMATION', 'ADDITIONALDETAILS', 'OTHERINFORMATION']
  }
];

const compactHeading = value => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const HEADING_TO_FIELD = new Map(
  SECTION_HEADINGS.flatMap(section => section.labels.map(label => [label, section.field]))
);

const getResumeSections = resumeText => {
  const sections = [];
  let current;

  for (const rawLine of String(resumeText || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^--- (?:COLUMN|PAGE) BREAK ---$/.test(line)) {
      current = undefined;
      continue;
    }

    const field = HEADING_TO_FIELD.get(compactHeading(line));
    if (field) {
      current = { field, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  return sections;
};

const getHeadingCandidates = resumeText => {
  const lines = String(resumeText || '')
    .split(/\r?\n/)
    .map(line => compactHeading(line))
    .filter(Boolean);
  const candidates = new Set(lines);

  for (let index = 0; index < lines.length; index += 1) {
    candidates.add(`${lines[index]}${lines[index + 1] || ''}`);
    candidates.add(`${lines[index]}${lines[index + 1] || ''}${lines[index + 2] || ''}`);

    if (lines[index].length === 1) {
      let joinedLetters = '';
      for (
        let letterIndex = index;
        letterIndex < lines.length && lines[letterIndex].length === 1 && joinedLetters.length < 40;
        letterIndex += 1
      ) {
        joinedLetters += lines[letterIndex];
        candidates.add(joinedLetters);
      }
    }
  }

  return candidates;
};

export const findResumeSectionHeadings = resumeText => {
  const candidates = getHeadingCandidates(resumeText);
  return SECTION_HEADINGS
    .filter(section => section.labels.some(label => candidates.has(label)))
    .map(section => section.field);
};

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_RANGE_PATTERN = new RegExp(
  `\\b(?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*[-–—]\\s*(?:(?:${MONTH}\\s+)?(?:19|20)\\d{2}|Present|Current)\\b`,
  'gi'
);

const countDateRanges = lines => lines.reduce((total, line) => (
  total + [...line.matchAll(DATE_RANGE_PATTERN)].length
), 0);

const countListEntries = lines => lines.reduce((total, line) => {
  if (!line || line.length > 120) return total;
  const entries = line.split(/\s*(?:[,;•·|]|\s\/\s)\s*/).filter(Boolean);
  return total + entries.length;
}, 0);

const countSkillEntries = lines => lines.filter(line => (
  /^[•·▪◦*-]\s*\S/.test(line) ||
  /^[A-Z][A-Za-z0-9&/+().'-]*(?:\s+[A-Za-z0-9&/+().'-]+){0,10}$/.test(line)
)).length;

const toSourceParagraphs = lines => {
  const paragraphs = [];
  let current = '';

  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/^[•·▪◦*-]\s*/, '').trim();
    if (!line) continue;
    const startsBullet = /^[•·▪◦*-]\s*/.test(String(rawLine || ''));
    if (startsBullet && current) {
      paragraphs.push(current);
      current = '';
    }
    current = current ? `${current} ${line}` : line;
    if (/[.!?]$/.test(line)) {
      paragraphs.push(current);
      current = '';
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs;
};

const getSectionLines = (resumeText, field) => getResumeSections(resumeText)
  .filter(section => section.field === field)
  .flatMap(section => section.lines);

const extractSourceEmail = resumeText => {
  const match = getSectionLines(resumeText, 'contact').join(' ')
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || '';
};

const normalizePhoneCandidate = value => String(value || '').replace(/\s+/g, ' ').trim();

const isDateRange = value => {
  DATE_RANGE_PATTERN.lastIndex = 0;
  return DATE_RANGE_PATTERN.test(String(value || ''));
};

export const isValidResumePhone = value => {
  const phone = normalizePhoneCandidate(value);
  if (!phone || isDateRange(phone)) return false;
  if (/[A-Za-z@]/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
};

const extractSourcePhone = resumeText => {
  for (const line of getSectionLines(resumeText, 'contact')) {
    if (/\b(?:passport|identification|identity|national id|postal|postcode|zip)\b/i.test(line)) continue;
    const candidates = line.match(/(?:\+\s*)?(?:\(?\d{1,4}\)?[\s.-]*){2,}\d{2,4}/g) || [];
    const phone = candidates.map(normalizePhoneCandidate).find(isValidResumePhone);
    if (phone) return phone;
  }
  return '';
};

const isValidContactLocation = value => {
  const location = String(value || '').trim();
  return (
    Boolean(location) &&
    location.length <= 500 &&
    location.split(/\r?\n/).length <= 8 &&
    !/--- (?:COLUMN|PAGE) BREAK ---/.test(location) &&
    !/^(?:WORK EXPERIENCE|EDUCATION|SKILLS|PROFILE|SUMMARY)$/im.test(location)
  );
};

const extractSourceLocation = resumeText => {
  const email = extractSourceEmail(resumeText);
  const phone = extractSourcePhone(resumeText);
  const locationLines = getSectionLines(resumeText, 'contact').filter(line => {
    if (!line) return false;
    if (email && line.includes(email)) return false;
    if (phone && line.includes(phone)) return false;
    if (/^(?:e-?mail|phone|mobile|tel|contact)(?:\s|:|$)/i.test(line)) return false;
    return true;
  });
  return locationLines.join(', ').trim();
};

const isValidSummary = value => {
  const summary = String(value || '').trim();
  return (
    summary.length >= 20 &&
    summary.length <= 2_000 &&
    !/--- (?:COLUMN|PAGE) BREAK ---/.test(summary) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(summary)
  );
};

const extractSourceSummary = resumeText => toSourceParagraphs(
  getSectionLines(resumeText, 'summary')
).join(' ').slice(0, 2_000);

export const isValidYearsExperience = value => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 80;
  const years = String(value || '').trim();
  return /^(?:\d{1,2}|(?:(?:over|more than|nearly|approximately|around)\s+)?\d{1,2}\+?\s*(?:years?|yrs?)(?:\s+of\s+(?:(?:professional|culinary)\s+)?experience)?)$/i.test(years);
};

const deriveYearsFromSummary = summary => {
  const match = String(summary || '').match(
    /\b((?:(?:over|more than|nearly|approximately|around)\s+)?\d{1,2}\+?\s+years?)\b/i
  );
  return match?.[1]?.replace(/\s+/g, ' ').trim() || '';
};

const deriveYearsFromExperienceDates = resumeText => {
  const ranges = getSectionLines(resumeText, 'experience')
    .flatMap(line => [...line.matchAll(DATE_RANGE_PATTERN)].map(match => match[0]));
  const starts = [];
  const ends = [];
  const currentYear = new Date().getUTCFullYear();

  for (const range of ranges) {
    const years = range.match(/(?:19|20)\d{2}/g) || [];
    if (!years.length) continue;
    starts.push(Number(years[0]));
    ends.push(/present|current/i.test(range) ? currentYear : Number(years[years.length - 1]));
  }

  if (!starts.length || !ends.length) return '';
  const duration = Math.max(...ends) - Math.min(...starts);
  return duration >= 0 && duration <= 80 ? `${duration} years` : '';
};

const achievementSourceEntries = resumeText => [
  ...toSourceParagraphs(getSectionLines(resumeText, 'achievements')),
  ...toSourceParagraphs(getSectionLines(resumeText, 'awards'))
].filter(Boolean);

const normalizeComparable = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isValidEmail = value => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(value || '').trim());

export const recoverResumeExtraction = (resumeText, value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const basicProfile = source.basicProfile && typeof source.basicProfile === 'object'
    ? { ...source.basicProfile }
    : {};
  const about = source.about && typeof source.about === 'object' ? { ...source.about } : {};
  const contact = source.contact && typeof source.contact === 'object' ? { ...source.contact } : {};
  const existingSummary = isValidSummary(basicProfile.shortBio)
    ? basicProfile.shortBio
    : (isValidSummary(about.body) ? about.body : '');
  const recoveredSummary = existingSummary || extractSourceSummary(resumeText);
  if (!isValidSummary(basicProfile.shortBio) && recoveredSummary) basicProfile.shortBio = recoveredSummary;
  if (typeof basicProfile.yearsExperience === 'number' && isValidYearsExperience(basicProfile.yearsExperience)) {
    basicProfile.yearsExperience = String(basicProfile.yearsExperience);
  }

  if (!isValidEmail(contact.email)) contact.email = extractSourceEmail(resumeText);
  if (!isValidResumePhone(contact.phone)) contact.phone = extractSourcePhone(resumeText);
  if (!isValidContactLocation(contact.location)) contact.location = extractSourceLocation(resumeText);

  if (!isValidYearsExperience(basicProfile.yearsExperience)) {
    basicProfile.yearsExperience = (
      deriveYearsFromSummary(recoveredSummary) ||
      deriveYearsFromExperienceDates(resumeText) ||
      ''
    );
  }

  const awards = Array.isArray(source.awards)
    ? source.awards.filter(item => item && typeof item === 'object').map(item => ({ ...item }))
    : [];
  const representedAchievements = new Set(awards.flatMap(item => (
    [item.name, item.description].map(normalizeComparable).filter(Boolean)
  )));

  for (const achievement of achievementSourceEntries(resumeText)) {
    const comparable = normalizeComparable(achievement);
    if (!comparable || [...representedAchievements].some(existing => (
      existing.includes(comparable) || comparable.includes(existing)
    ))) continue;
    awards.push({ name: achievement, description: achievement });
    representedAchievements.add(comparable);
  }

  const experience = mergeSourceExperiences(resumeText, source.experience);

  return {
    ...source,
    basicProfile,
    about,
    contact,
    awards,
    experience
  };
};

const getSourceExpectations = resumeText => {
  const sections = getResumeSections(resumeText);
  const linesFor = field => sections.filter(section => section.field === field).flatMap(section => section.lines);
  const experienceLines = linesFor('experience');
  const educationLines = linesFor('education');
  const languageLines = linesFor('languages');
  const skillLines = linesFor('skills');
  const summaryLines = linesFor('summary');
  const contactLines = linesFor('contact');
  const counts = {
    experience: countDateRanges(experienceLines),
    education: countDateRanges(educationLines) || (educationLines.length ? 1 : 0),
    languages: countListEntries(languageLines),
    skills: countSkillEntries(skillLines),
    certificates: linesFor('certificates').length ? 1 : 0,
    awards: achievementSourceEntries(resumeText).length,
    projects: linesFor('projects').length ? 1 : 0
  };
  const contactText = contactLines.join('\n');

  return {
    sections: [...new Set(sections.map(section => section.field))],
    counts,
    summary: summaryLines.join(' ').length >= 30,
    email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(contactText),
    phone: /(?:\+?\d[\s().-]*){7,}/.test(contactText),
    location: Boolean(extractSourceLocation(resumeText))
  };
};

const getActualCounts = source => Object.fromEntries(
  ['experience', 'education', 'languages', 'skills', 'certificates', 'awards', 'projects']
    .map(field => [field, Array.isArray(source[field]) ? source[field].length : 0])
);

export const validateResumeExtraction = (resumeText, value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const missingFields = Object.entries(REQUIRED_TOP_LEVEL_FIELDS)
    .filter(([field, type]) => (
      type === 'array'
        ? !Array.isArray(source[field])
        : !source[field] || typeof source[field] !== 'object' || Array.isArray(source[field])
    ))
    .map(([field]) => field);
  const expectations = getSourceExpectations(resumeText);
  const detectedSections = expectations.sections;
  const actualCounts = getActualCounts(source);
  const incompleteSections = Object.entries(expectations.counts)
    .filter(([field, expected]) => expected > 0 && actualCounts[field] < expected)
    .map(([field, expected]) => ({
      field,
      expected,
      actual: actualCounts[field]
    }));
  const emptyDetectedSections = incompleteSections
    .filter(section => section.actual === 0)
    .map(section => section.field);
  const basicProfile = source.basicProfile && typeof source.basicProfile === 'object' ? source.basicProfile : {};
  const about = source.about && typeof source.about === 'object' ? source.about : {};
  const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  const missingContent = [];
  if (expectations.summary && !String(basicProfile.shortBio || about.body || '').trim()) {
    missingContent.push('summary');
  }
  if (expectations.email && !String(contact.email || '').trim()) missingContent.push('contact.email');
  if (expectations.phone && !String(contact.phone || '').trim()) missingContent.push('contact.phone');
  if (expectations.location && !String(contact.location || '').trim()) missingContent.push('contact.location');

  const yearsExperience = String(basicProfile.yearsExperience || '').trim();
  const corruptFields = [];
  if (yearsExperience && !isValidYearsExperience(yearsExperience)) {
    corruptFields.push('basicProfile.yearsExperience');
  }
  if (contact.phone && !isValidResumePhone(contact.phone)) corruptFields.push('contact.phone');
  if (contact.email && !isValidEmail(contact.email)) corruptFields.push('contact.email');
  if (contact.location && !isValidContactLocation(contact.location)) corruptFields.push('contact.location');
  const employmentValidation = validateEmploymentAssociations(resumeText, source.experience);

  return {
    complete: (
      missingFields.length === 0 &&
      incompleteSections.length === 0 &&
      missingContent.length === 0 &&
      corruptFields.length === 0 &&
      employmentValidation.complete
    ),
    missingFields,
    emptyDetectedSections,
    incompleteSections,
    missingContent,
    corruptFields,
    detectedSections,
    expectedCounts: expectations.counts,
    actualCounts,
    employmentValidation
  };
};

export const buildResumeRetryInstruction = validation => {
  const problems = [
    ...validation.missingFields.map(field => `the required "${field}" array was omitted`),
    ...validation.incompleteSections.map(section => (
      `"${section.field}" contains ${section.actual} entries but at least ${section.expected} are visible in the resume`
    )),
    ...validation.missingContent.map(field => `"${field}" is present in the resume but missing from the JSON`),
    ...validation.corruptFields.map(field => `"${field}" contains unrelated resume content`),
    ...validation.employmentValidation.issues.map(issue => `employment association failed: ${issue}`)
  ];

  return `

IMPORTANT RETRY:
The previous extraction was incomplete because ${problems.join('; ')}.
Re-scan the ENTIRE resume from beginning to end before generating JSON.
Return every required top-level property and every distinct entry in each detected section.
Do not return until all detected sections have been checked against the JSON.
`;
};

export class ResumeExtractionIncompleteError extends Error {
  constructor(validation) {
    super('AI extraction incomplete.');
    this.name = 'ResumeExtractionIncompleteError';
    this.validation = validation;
  }
}

export const extractResumeWithCompletenessRetry = async ({
  resumeText,
  extract,
  onIncomplete = () => undefined
}) => {
  let retryInstruction = '';

  for (let extractionAttempt = 1; extractionAttempt <= 2; extractionAttempt += 1) {
    const result = await extract(retryInstruction);
    const recovered = recoverResumeExtraction(resumeText, result.parsed);
    const validation = validateResumeExtraction(resumeText, recovered);

    if (validation.complete) return { ...result, parsed: recovered };

    onIncomplete(validation, extractionAttempt);
    if (extractionAttempt === 2) {
      throw new ResumeExtractionIncompleteError(validation);
    }
    retryInstruction = buildResumeRetryInstruction(validation);
  }

  throw new ResumeExtractionIncompleteError(validateResumeExtraction(resumeText, {}));
};
