const BULLET_PREFIX = /^\s*(?:[•●▪◦‣⁃*-]|\d{1,2}[.)])\s+/;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9])/g;

const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();

const appendUnique = (items: string[], seen: Set<string>, value: string) => {
  const responsibility = tidy(value);
  const identity = responsibility.toLocaleLowerCase();
  if (!responsibility || seen.has(identity)) return;
  seen.add(identity);
  items.push(responsibility);
};

const splitPlainText = (value: string) => value
  .split(SENTENCE_BOUNDARY)
  .map(tidy)
  .filter(Boolean);

const splitPlainLines = (lines: string[]) => {
  const items: string[] = [];
  let current = '';

  for (const rawLine of lines) {
    const line = tidy(rawLine);
    if (!line) continue;
    const isContinuation = Boolean(current) && (/^[a-z(]/.test(line) || /[,;:]$/.test(current));
    if (isContinuation) {
      current = `${current} ${line}`;
    } else {
      if (current) items.push(current);
      current = line;
    }
  }
  if (current) items.push(current);
  return items;
};

export const toExperienceResponsibilities = (description?: string) => {
  if (!description?.trim()) return [];

  const lines = description.replace(/\r\n?/g, '\n').split('\n');
  const hasExplicitBullets = lines.some(line => BULLET_PREFIX.test(line));
  const responsibilities: string[] = [];
  const seen = new Set<string>();

  if (hasExplicitBullets) {
    let current = '';
    const flush = () => {
      appendUnique(responsibilities, seen, current);
      current = '';
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (BULLET_PREFIX.test(line)) {
        flush();
        current = line.replace(BULLET_PREFIX, '');
      } else if (current) {
        current = `${current} ${line}`;
      } else {
        splitPlainText(line).forEach(item => appendUnique(responsibilities, seen, item));
      }
    }
    flush();
    return responsibilities;
  }

  const nonBlankLines = lines.map(tidy).filter(Boolean);
  const plainResponsibilities = nonBlankLines.length > 1
    ? splitPlainLines(lines).flatMap(splitPlainText)
    : splitPlainText(nonBlankLines[0] || '');

  plainResponsibilities
    .forEach(item => appendUnique(responsibilities, seen, item));

  return responsibilities;
};
