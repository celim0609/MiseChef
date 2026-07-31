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

  const paragraphs = description
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(paragraph => tidy(paragraph))
    .filter(Boolean);

  paragraphs
    .flatMap(splitPlainText)
    .forEach(item => appendUnique(responsibilities, seen, item));

  return responsibilities;
};
