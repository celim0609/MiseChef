import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage
} from 'pdf-lib';
import type { ChefProfile, ResumeExportSettings } from '../types';

const PAGE_MARGIN = 48;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
const PRIMARY = rgb(0.16, 0.28, 0.21);
const SECONDARY = rgb(0.35, 0.40, 0.36);
const TEXT = rgb(0.13, 0.15, 0.13);
const DIVIDER = rgb(0.78, 0.82, 0.79);

const formatDate = (month?: string, year?: string) => [month, year].filter(Boolean).join(' ');

const safeFileName = (value: string) => value
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .toLowerCase()
  .slice(0, 80) || 'chef';

export const getResumeFileName = (profile: ChefProfile) =>
  `${safeFileName(profile.basicInfo.fullName)}-resume.pdf`;

const textForFont = (value: string, font: PDFFont) => {
  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '-');
  return [...normalized].map(character => {
    if (character === '\n') return character;
    try {
      font.encodeText(character);
      return character;
    } catch {
      return '?';
    }
  }).join('');
};

const wrapText = (value: string, font: PDFFont, size: number, maxWidth: number) => {
  const paragraphs = value.split(/\r?\n/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = textForFont(paragraph, font).split(/\s+/).filter(Boolean);
    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (!words.length || paragraphIndex < paragraphs.length - 1) lines.push('');
  });
  return lines;
};

const loadProfileImage = async (pdf: PDFDocument, imageUrl?: string): Promise<PDFImage | null> => {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = response.headers.get('content-type') || '';
    if (type.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50)) return pdf.embedPng(bytes);
    if (type.includes('jpeg') || type.includes('jpg') || (bytes[0] === 0xff && bytes[1] === 0xd8)) return pdf.embedJpg(bytes);
  } catch {
    // A profile photo must never prevent the resume itself from exporting.
  }
  return null;
};

export const buildChefProfilePdf = async (
  profile: ChefProfile,
  settings: ResumeExportSettings
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${profile.basicInfo.fullName} - Resume`);
  pdf.setAuthor(profile.basicInfo.fullName);
  pdf.setCreator('MiseChef');
  pdf.setProducer('MiseChef Chef Profile');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const profileImage = settings.includeProfilePhoto
    ? await loadProfileImage(pdf, profile.basicInfo.profilePhotoUrl)
    : null;
  let page: PDFPage = pdf.addPage(PageSizes.A4);
  let { width, height } = page.getSize();
  let y = height - PAGE_MARGIN;

  const addPage = () => {
    page = pdf.addPage(PageSizes.A4);
    ({ width, height } = page.getSize());
    y = height - PAGE_MARGIN;
  };

  const ensureSpace = (space: number) => {
    if (y - space < PAGE_MARGIN) addPage();
  };

  const drawWrapped = (
    value: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      maxWidth?: number;
      lineHeight?: number;
    } = {}
  ) => {
    const font = options.font || regular;
    const size = options.size || BODY_SIZE;
    const x = options.x || PAGE_MARGIN;
    const maxWidth = options.maxWidth || width - PAGE_MARGIN * 2;
    const lineHeight = options.lineHeight || LINE_HEIGHT;
    const lines = wrapText(value, font, size, maxWidth);
    lines.forEach(line => {
      ensureSpace(lineHeight);
      if (line) page.drawText(line, { x, y, size, font, color: options.color || TEXT });
      y -= lineHeight;
    });
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(38);
    y -= 8;
    page.drawText(textForFont(title.toUpperCase(), bold), {
      x: PAGE_MARGIN,
      y,
      size: 10,
      font: bold,
      color: PRIMARY
    });
    y -= 7;
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: width - PAGE_MARGIN, y },
      thickness: 0.7,
      color: DIVIDER
    });
    y -= 15;
  };

  const drawEntry = (title: string, metadata: string, description?: string) => {
    ensureSpace(description ? 56 : 38);
    drawWrapped(title, { font: bold, size: 10.5, lineHeight: 14 });
    if (metadata) drawWrapped(metadata, { size: 9, color: SECONDARY, lineHeight: 12 });
    if (description) {
      y -= 2;
      drawWrapped(description);
    }
    y -= 7;
  };

  const headerX = profileImage ? PAGE_MARGIN + 82 : PAGE_MARGIN;
  if (profileImage) {
    const dimensions = profileImage.scaleToFit(64, 64);
    page.drawImage(profileImage, {
      x: PAGE_MARGIN,
      y: y - dimensions.height + 8,
      width: dimensions.width,
      height: dimensions.height
    });
  }
  page.drawText(textForFont(profile.basicInfo.fullName, bold), {
    x: headerX,
    y,
    size: 24,
    font: bold,
    color: PRIMARY
  });
  y -= 25;
  drawWrapped(profile.basicInfo.professionalTitle, {
    x: headerX,
    maxWidth: width - PAGE_MARGIN - headerX,
    size: 13,
    color: SECONDARY,
    lineHeight: 16
  });
  const contact = [
    settings.includeEmail && profile.basicInfo.email,
    settings.includePhone && profile.basicInfo.phone,
    settings.includeLocation && [profile.basicInfo.location, profile.basicInfo.country].filter(Boolean).join(', ')
  ].filter(Boolean).join(' | ');
  if (contact) drawWrapped(contact, {
    x: headerX,
    maxWidth: width - PAGE_MARGIN - headerX,
    size: 9,
    lineHeight: 12
  });
  if (profileImage) y = Math.min(y, height - PAGE_MARGIN - 72);
  y -= 5;
  page.drawLine({
    start: { x: PAGE_MARGIN, y },
    end: { x: width - PAGE_MARGIN, y },
    thickness: 2,
    color: PRIMARY
  });

  if (profile.basicInfo.summary) {
    drawSectionTitle('Professional Summary');
    drawWrapped(profile.basicInfo.summary);
  }

  if (profile.skills.length) {
    drawSectionTitle('Skills');
    drawWrapped(profile.skills.join(' | '));
  }

  if (profile.experiences.length) {
    drawSectionTitle('Work Experience');
    profile.experiences.forEach(item => {
      const period = `${formatDate(item.startMonth, item.startYear) || 'Date not provided'} - ${
        item.currentlyWorking ? 'Present' : formatDate(item.endMonth, item.endYear) || 'Date not provided'
      }`;
      drawEntry(
        [item.jobTitle, item.companyName].filter(Boolean).join(' | '),
        [period, item.location].filter(Boolean).join(' | '),
        item.description
      );
    });
  }

  if (profile.education.length) {
    drawSectionTitle('Education');
    profile.education.forEach(item => drawEntry(
      [item.qualification || item.fieldOfStudy, item.schoolName].filter(Boolean).join(' | '),
      [item.startYear, item.endYear].filter(Boolean).join(' - '),
      item.description
    ));
  }

  if (settings.includeCertificates && profile.certificates.length) {
    drawSectionTitle('Certificates');
    profile.certificates.forEach(item => drawEntry(
      item.name,
      [item.issuingOrganisation, item.issueDate].filter(Boolean).join(' | ')
    ));
  }

  if (settings.includeAwards && profile.awards.length) {
    drawSectionTitle('Awards');
    profile.awards.forEach(item => drawEntry(
      item.name,
      [item.issuingOrganisation, item.year].filter(Boolean).join(' | '),
      item.description
    ));
  }

  if (profile.languages.length) {
    drawSectionTitle('Languages');
    drawWrapped(profile.languages
      .map(item => [item.language, item.proficiency].filter(Boolean).join(' - '))
      .join(' | '));
  }

  const links = [
    settings.includePortfolioLink && profile.socialLinks.website,
    settings.includeMiseChefProfileLink && profile.visibility === 'public' && profile.profileSlug
      ? `${typeof window === 'undefined' ? 'https://misechef.ai' : window.location.origin}/@${profile.profileSlug}`
      : ''
  ].filter(Boolean) as string[];
  if (links.length) {
    drawSectionTitle('Links');
    links.forEach(link => drawWrapped(link, { size: 9, color: PRIMARY, lineHeight: 12 }));
  }

  return pdf.save();
};

export const createChefProfilePdfBlob = async (
  profile: ChefProfile,
  settings: ResumeExportSettings
) => {
  const bytes = await buildChefProfilePdf(profile, settings);
  return new Blob([bytes], { type: 'application/pdf' });
};

export const exportChefProfilePdf = async (
  profile: ChefProfile,
  settings: ResumeExportSettings
) => {
  const blob = await createChefProfilePdfBlob(profile, settings);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = getResumeFileName(profile);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return { fileName: anchor.download, size: blob.size, type: blob.type };
};
