const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_RANGE = new RegExp(
  `((?:${MONTH}\\s+)?(?:19|20)\\d{2})\\s*[-–—]\\s*((?:${MONTH}\\s+)?(?:19|20)\\d{2}|Present|Current)`,
  'i'
);

const WORK_HEADINGS = new Set([
  'WORKEXPERIENCE',
  'EXPERIENCE',
  'EMPLOYMENTHISTORY',
  'PROFESSIONALEXPERIENCE',
  'CAREERHISTORY'
]);

const SECTION_HEADINGS = new Set([
  'PROFILE', 'PERSONALPROFILE', 'PROFESSIONALPROFILE', 'SUMMARY', 'CAREERSUMMARY',
  'PROFESSIONALSUMMARY', 'ABOUT', 'ABOUTME', 'OBJECTIVE', 'CONTACT', 'CONTACTME',
  'CONTACTINFORMATION', 'PERSONALDETAILS', 'EDUCATION', 'ACADEMICBACKGROUND',
  'ACADEMICHISTORY', 'QUALIFICATIONS', 'LANGUAGE', 'LANGUAGES', 'SKILLS',
  'TECHNICALSKILLS', 'CORECOMPETENCIES', 'EXPERTISE', 'CERTIFICATE', 'CERTIFICATES',
  'CERTIFICATION', 'CERTIFICATIONS', 'LICENSESANDCERTIFICATIONS', 'AWARD', 'AWARDS',
  'HONOURS', 'HONORS', 'ACHIEVEMENT', 'ACHIEVEMENTS', 'KEYACHIEVEMENTS',
  'ACCOMPLISHMENT', 'ACCOMPLISHMENTS', 'AWARDSANDACHIEVEMENTS', 'CAREERHIGHLIGHTS',
  'PROJECT', 'PROJECTS', 'PORTFOLIO', 'SELECTEDPROJECTS', 'ADDITIONALINFORMATION'
]);

const compact = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const cleanLine = value => String(value || '').replace(/\s+/g, ' ').trim();
const isBoundary = value => /^--- (?:COLUMN|PAGE) BREAK ---$/.test(cleanLine(value));
const isSectionHeading = value => SECTION_HEADINGS.has(compact(value));
const meaningfulIndexesBefore = (lines, index, minimum) => {
  const indexes = [];
  for (let cursor = index - 1; cursor >= minimum && indexes.length < 3; cursor -= 1) {
    if (!lines[cursor].text || isBoundary(lines[cursor].text)) continue;
    if (isSectionHeading(lines[cursor].text)) break;
    indexes.push(cursor);
  }
  return indexes;
};

const stripOuterPunctuation = value => cleanLine(value)
  .replace(/^[|,;:\s-]+/, '')
  .replace(/[|,;:\s-]+$/, '')
  .replace(/[（(]\s*$/, '')
  .replace(/^[）)]\s*$/, '')
  .trim();

const splitExplicitLocation = value => {
  let text = cleanLine(value);
  let location = '';
  const parenthetical = text.match(/\s*[（(]([^()（）]{2,50})[）)]\s*$/);
  const employmentTypes = /^(?:contract|contractor|full[- ]?time|part[- ]?time|internship|temporary|permanent)$/i;
  if (parenthetical && !employmentTypes.test(parenthetical[1].trim())) {
    location = parenthetical[1].trim();
    text = text.slice(0, parenthetical.index).trim();
  } else {
    const comma = text.match(/,\s*([^,]{2,50})$/);
    if (comma && /^[A-Za-z][A-Za-z .'-]+$/.test(comma[1])) {
      location = comma[1].trim();
      text = text.slice(0, comma.index).trim();
    }
  }
  return { text, location };
};

const parseHeader = (lines, dateLineIndex, sectionStart) => {
  const dateLine = lines[dateLineIndex].text;
  const match = dateLine.match(DATE_RANGE);
  if (!match) return undefined;

  const startDate = cleanLine(match[1]);
  const endDate = cleanLine(match[2]);
  const before = stripOuterPunctuation(dateLine.slice(0, match.index));
  const after = stripOuterPunctuation(dateLine.slice((match.index || 0) + match[0].length));
  let titleText = stripOuterPunctuation([before, after].filter(Boolean).join(' '));
  const previous = meaningfulIndexesBefore(lines, dateLineIndex, sectionStart);
  let companyLineIndex = dateLineIndex;
  let companyText = '';

  if (titleText.includes('|')) {
    const parts = titleText.split('|').map(stripOuterPunctuation).filter(Boolean);
    if (parts.length >= 2) {
      companyText = parts[0];
      titleText = parts.slice(1).join(' ');
    }
  }

  if (!companyText && titleText) {
    companyLineIndex = previous[0] ?? dateLineIndex;
    companyText = previous[0] === undefined ? '' : lines[previous[0]].text;
  } else if (!titleText) {
    const titleIndex = previous[0];
    companyLineIndex = previous[1] ?? titleIndex ?? dateLineIndex;
    titleText = titleIndex === undefined ? '' : lines[titleIndex].text;
    companyText = previous[1] === undefined ? '' : lines[previous[1]].text;
  }

  const title = splitExplicitLocation(titleText);
  const company = splitExplicitLocation(companyText);
  return {
    title: title.text,
    company: company.text,
    startDate,
    endDate,
    location: title.location || company.location,
    dateLineIndex,
    companyLineIndex,
    page: lines[dateLineIndex].page
  };
};

const buildDescription = (lines, start, end) => {
  const descriptionLines = [];
  const achievements = [];
  let collectingAchievements = false;

  for (let index = start; index < end; index += 1) {
    const text = lines[index].text;
    if (!text || isBoundary(text)) continue;
    const heading = compact(text);
    if (heading === 'ACHIEVEMENTS' || heading === 'KEYACHIEVEMENTS') {
      collectingAchievements = true;
      continue;
    }
    const cleaned = text.replace(/^[•·▪◦*-]\s*/, '').trim();
    if (!cleaned) continue;
    (collectingAchievements ? achievements : descriptionLines).push(cleaned);
  }

  return {
    description: descriptionLines.join('\n'),
    achievements
  };
};

export const reconstructSourceExperiences = resumeText => {
  let page = 1;
  const lines = String(resumeText || '').split(/\r?\n/).map((raw, index) => {
    const text = cleanLine(raw);
    const line = { text, index, page };
    if (/^--- PAGE BREAK ---$/.test(text)) page += 1;
    return line;
  });
  const sectionStart = lines.findIndex(line => WORK_HEADINGS.has(compact(line.text)));
  if (sectionStart < 0) return [];

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (isSectionHeading(lines[index].text) && !WORK_HEADINGS.has(compact(lines[index].text))) {
      sectionEnd = index;
      break;
    }
  }

  const headers = [];
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (!DATE_RANGE.test(lines[index].text)) continue;
    const header = parseHeader(lines, index, sectionStart + 1);
    if (header && (header.title || header.company)) headers.push(header);
  }

  return headers.map((header, index) => {
    const next = headers[index + 1];
    const descriptionEnd = next?.companyLineIndex ?? sectionEnd;
    const details = buildDescription(lines, header.dateLineIndex + 1, descriptionEnd);
    let sourceEnd = Math.max(header.dateLineIndex, descriptionEnd - 1);
    while (
      sourceEnd > header.dateLineIndex &&
      (!lines[sourceEnd]?.text || isBoundary(lines[sourceEnd]?.text))
    ) {
      sourceEnd -= 1;
    }
    return {
      title: header.title,
      company: header.company,
      startDate: header.startDate,
      endDate: header.endDate,
      location: header.location,
      description: details.description,
      achievements: details.achievements,
      sourceLineRange: {
        start: lines[header.companyLineIndex]?.index ?? lines[header.dateLineIndex].index,
        end: lines[sourceEnd]?.index ?? lines[header.dateLineIndex].index
      },
      sourcePage: header.page
    };
  });
};

const tokens = value => new Set(
  cleanLine(value).toLowerCase().match(/[a-z0-9]+/g)?.filter(token => token.length > 2) || []
);

const tokenSimilarity = (left, right) => {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
};

const dateSimilarity = (source, candidate) => {
  const sourceYears = `${source.startDate} ${source.endDate}`.match(/(?:19|20)\d{2}|present|current/gi) || [];
  const candidateYears = `${candidate.startDate || ''} ${candidate.endDate || ''}`.match(/(?:19|20)\d{2}|present|current/gi) || [];
  if (!sourceYears.length || !candidateYears.length) return 0;
  const matched = sourceYears.filter(value => candidateYears.some(candidate => (
    candidate.toLowerCase() === value.toLowerCase()
  ))).length;
  return matched / sourceYears.length;
};

export const scoreExperienceMatch = (source, candidate, sourceIndex, candidateIndex, total) => {
  const company = tokenSimilarity(source.company, candidate.organization);
  const title = tokenSimilarity(source.title, candidate.role);
  const dates = dateSimilarity(source, candidate);
  const description = tokenSimilarity(source.description, candidate.description);
  const order = total <= 1 ? 1 : 1 - Math.min(1, Math.abs(sourceIndex - candidateIndex) / (total - 1));
  const score = company * 0.3 + title * 0.3 + dates * 0.2 + description * 0.1 + order * 0.1;
  const strongSignals = [company, title, dates, description].filter(value => value >= 0.5).length;
  return { score, strongSignals, company, title, dates, description, order };
};

export const mergeSourceExperiences = (resumeText, geminiExperiences) => {
  const sourceExperiences = reconstructSourceExperiences(resumeText);
  const candidates = Array.isArray(geminiExperiences) ? geminiExperiences : [];
  if (!sourceExperiences.length) return candidates;
  const used = new Set();

  return sourceExperiences.map((source, sourceIndex) => {
    let best;
    candidates.forEach((candidate, candidateIndex) => {
      if (!candidate || typeof candidate !== 'object' || used.has(candidateIndex)) return;
      const confidence = scoreExperienceMatch(
        source,
        candidate,
        sourceIndex,
        candidateIndex,
        Math.max(sourceExperiences.length, candidates.length)
      );
      if (
        confidence.score >= 0.55 &&
        confidence.strongSignals >= 2 &&
        (!best || confidence.score > best.confidence.score)
      ) {
        best = { candidate, candidateIndex, confidence };
      }
    });
    if (best) used.add(best.candidateIndex);

    return {
      role: source.title || cleanLine(best?.candidate?.role),
      organization: source.company || cleanLine(best?.candidate?.organization),
      location: source.location || cleanLine(best?.candidate?.location),
      employmentType: cleanLine(best?.candidate?.employmentType),
      startDate: source.startDate || cleanLine(best?.candidate?.startDate),
      endDate: source.endDate || cleanLine(best?.candidate?.endDate),
      isCurrent: /present|current/i.test(source.endDate) || best?.candidate?.isCurrent === true,
      description: source.description || cleanLine(best?.candidate?.description),
      achievements: source.achievements.length
        ? source.achievements
        : (Array.isArray(best?.candidate?.achievements) ? best.candidate.achievements.map(cleanLine).filter(Boolean) : []),
      sourceLineRange: source.sourceLineRange,
      sourcePage: source.sourcePage,
      matchConfidence: best ? Number(best.confidence.score.toFixed(3)) : 0
    };
  });
};

export const validateEmploymentAssociations = (resumeText, experiences) => {
  const source = reconstructSourceExperiences(resumeText);
  const actual = Array.isArray(experiences) ? experiences : [];
  const issues = [];
  if (!source.length) {
    return {
      complete: true,
      issues,
      expectedCount: 0,
      actualCount: actual.length
    };
  }
  if (actual.length !== source.length) issues.push('experience-count');

  const identities = new Set();
  source.forEach((expected, index) => {
    const entry = actual[index] || {};
    if (!expected.title && !expected.company) issues.push(`experience-${index}-missing-identity`);
    if (expected.startDate && (!entry.startDate || !entry.endDate)) issues.push(`experience-${index}-missing-dates`);
    if (cleanLine(expected.title) && compact(entry.role) !== compact(expected.title)) {
      issues.push(`experience-${index}-title`);
    }
    if (cleanLine(expected.company) && compact(entry.organization) !== compact(expected.company)) {
      issues.push(`experience-${index}-company`);
    }
    if (compact(entry.startDate) !== compact(expected.startDate)) issues.push(`experience-${index}-start-date`);
    if (compact(entry.endDate) !== compact(expected.endDate)) issues.push(`experience-${index}-end-date`);
    if (cleanLine(entry.description) !== cleanLine(expected.description)) issues.push(`experience-${index}-description`);
    const identity = [entry.organization, entry.role, entry.startDate, entry.endDate].map(compact).join('|');
    if (identities.has(identity)) issues.push(`experience-${index}-duplicate`);
    identities.add(identity);
  });

  return {
    complete: issues.length === 0,
    issues,
    expectedCount: source.length,
    actualCount: actual.length
  };
};
