export type ResumePdfTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
};

type ResumePdfLine = {
  items: ResumePdfTextItem[];
  y: number;
  height: number;
  hardBreak: boolean;
};

const HEADING_LABELS = new Map([
  ['PROFILE', 'PROFILE'],
  ['PROFESSIONALPROFILE', 'PROFESSIONAL PROFILE'],
  ['SUMMARY', 'SUMMARY'],
  ['PROFESSIONALSUMMARY', 'PROFESSIONAL SUMMARY'],
  ['ABOUTME', 'ABOUT ME'],
  ['CONTACT', 'CONTACT'],
  ['CONTACTME', 'CONTACT ME'],
  ['CONTACTINFORMATION', 'CONTACT INFORMATION'],
  ['EDUCATION', 'EDUCATION'],
  ['ACADEMICBACKGROUND', 'ACADEMIC BACKGROUND'],
  ['ACADEMICHISTORY', 'ACADEMIC HISTORY'],
  ['LANGUAGE', 'LANGUAGES'],
  ['LANGUAGES', 'LANGUAGES'],
  ['SKILLS', 'SKILLS'],
  ['TECHNICALSKILLS', 'TECHNICAL SKILLS'],
  ['CORECOMPETENCIES', 'CORE COMPETENCIES'],
  ['EXPERTISE', 'EXPERTISE'],
  ['KEYACHIEVEMENTS', 'KEY ACHIEVEMENTS'],
  ['ACHIEVEMENTS', 'ACHIEVEMENTS'],
  ['AWARDS', 'AWARDS'],
  ['WORKEXPERIENCE', 'WORK EXPERIENCE'],
  ['PROFESSIONALEXPERIENCE', 'PROFESSIONAL EXPERIENCE'],
  ['EMPLOYMENTHISTORY', 'EMPLOYMENT HISTORY'],
  ['CAREERHISTORY', 'CAREER HISTORY'],
  ['EXPERIENCE', 'EXPERIENCE'],
  ['CERTIFICATES', 'CERTIFICATES'],
  ['CERTIFICATIONS', 'CERTIFICATIONS'],
  ['PROJECTS', 'PROJECTS'],
  ['PORTFOLIO', 'PORTFOLIO']
]);

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const compactHeading = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const normalizeResumeHeading = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  const compact = compactHeading(trimmed);
  const mapped = HEADING_LABELS.get(compact);
  if (!mapped) return trimmed;

  const tokens = trimmed.split(/\s+/);
  const singleLetterRatio = tokens.filter(token => /^[A-Z]$/i.test(token)).length / Math.max(tokens.length, 1);
  const alreadyHeading = trimmed === trimmed.toUpperCase() && trimmed.length <= 45;
  return singleLetterRatio >= 0.5 || alreadyHeading ? mapped : trimmed;
};

const joinLineItems = (items: ResumePdfTextItem[]) => {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let output = '';
  let previous: ResumePdfTextItem | undefined;

  for (const item of sorted) {
    const text = item.text
      .replace(/\s+/g, ' ')
      .replace(/([)）])(?=(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b)/g, '$1 ')
      .trim();
    if (!text) continue;

    if (!previous) {
      output = text;
      previous = item;
      continue;
    }

    const gap = item.x - (previous.x + previous.width);
    const continuesFragment = (
      gap <= Math.max(1.5, Math.min(previous.height, item.height) * 0.14) &&
      /^[a-z]/.test(text)
    );
    const closesPunctuation = /^[,.;:!?%)\]}]/.test(text);
    const followsOpeningPunctuation = /[(\[{]$/.test(output);
    output += continuesFragment || closesPunctuation || followsOpeningPunctuation ? text : ` ${text}`;
    previous = item;
  }

  return normalizeResumeHeading(output);
};

const groupItemsIntoLines = (items: ResumePdfTextItem[]) => {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: ResumePdfLine[] = [];

  for (const item of sorted) {
    const line = lines.find(candidate => (
      !candidate.hardBreak &&
      Math.abs(candidate.y - item.y) <= Math.max(2, Math.min(item.height, candidate.height) * 0.45)
    ));

    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
      line.height = Math.max(line.height, item.height);
      line.hardBreak ||= item.hasEOL;
    } else {
      lines.push({
        items: [item],
        y: item.y,
        height: item.height,
        hardBreak: item.hasEOL
      });
    }
  }

  return lines.sort((a, b) => b.y - a.y || (
    Math.min(...a.items.map(item => item.x)) - Math.min(...b.items.map(item => item.x))
  ));
};

const findColumnSplit = (
  items: ResumePdfTextItem[],
  regionStart: number,
  regionEnd: number
) => {
  if (items.length < 6 || regionEnd - regionStart < 180) return undefined;

  const starts = [...new Set(items.map(item => Math.round(item.x * 2) / 2))]
    .filter(x => x >= regionStart && x <= regionEnd)
    .sort((a, b) => a - b);
  let best: { split: number; score: number } | undefined;

  for (let index = 0; index < starts.length - 1; index += 1) {
    const gap = starts[index + 1] - starts[index];
    if (gap < Math.max(32, (regionEnd - regionStart) * 0.075)) continue;

    const candidates = Array.from({ length: 9 }, (_, candidateIndex) => (
      starts[index] + gap * (0.55 + candidateIndex * 0.05)
    ));

    for (const split of candidates) {
      if (split < regionStart + (regionEnd - regionStart) * 0.2) continue;
      if (split > regionStart + (regionEnd - regionStart) * 0.8) continue;

      const left = items.filter(item => item.x < split).length;
      const right = items.filter(item => item.x > split).length;
      const crossing = items.filter(item => item.x < split && item.x + item.width > split).length;
      const minimumSide = Math.min(left, right);
      if (minimumSide < Math.ceil(items.length * 0.18)) continue;
      if (crossing > Math.ceil(items.length * 0.12)) continue;

      const score = gap * minimumSide / Math.max(1, crossing + 1);
      if (!best || score > best.score) best = { split, score };
    }
  }

  return best?.split;
};

const splitIntoColumns = (
  items: ResumePdfTextItem[],
  pageWidth: number
) => {
  const split = findColumnSplit(items, 0, pageWidth);
  if (!split) return [items];

  const left = items.filter(item => item.x < split);
  const right = items.filter(item => item.x >= split);
  return left.length && right.length ? [left, right] : [items];
};

const renderColumn = (items: ResumePdfTextItem[]) => {
  const lines = groupItemsIntoLines(items)
    .map(line => ({ ...line, text: joinLineItems(line.items) }))
    .filter(line => line.text);
  const ordinaryGaps = lines
    .slice(0, -1)
    .map((line, index) => line.y - lines[index + 1].y)
    .filter(gap => gap > 1 && gap < 40);
  const normalGap = median(ordinaryGaps) || median(lines.map(line => line.height)) * 1.35 || 14;
  const output: string[] = [];

  lines.forEach((line, index) => {
    output.push(line.text);
    const next = lines[index + 1];
    if (!next) return;

    const verticalGap = line.y - next.y;
    const paragraphThreshold = Math.max(normalGap * 1.3, Math.max(line.height, next.height) * 1.75);
    if (verticalGap > paragraphThreshold) output.push('');
  });

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const reconstructResumePdfPage = (
  rawItems: ResumePdfTextItem[],
  pageWidth: number
) => {
  const items = rawItems.filter(item => item.text.trim() && Number.isFinite(item.x) && Number.isFinite(item.y));
  return splitIntoColumns(items, pageWidth)
    .map(renderColumn)
    .filter(Boolean)
    .join('\n\n--- COLUMN BREAK ---\n\n')
    .trim();
};
