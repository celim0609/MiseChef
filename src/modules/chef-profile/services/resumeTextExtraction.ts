import { loadPdfJsRuntime } from '../../../services/pdfRuntime';
import { reconstructResumePdfPage, type ResumePdfTextItem } from './resumePdfLayout';
import { classifyPdfFailure, ResumeImportError } from './resumeImportErrors';

const stripXml = (xml: string) => xml
  .replace(/<w:tab\/>/g, ' ')
  .replace(/<w:br\/>/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const inflateRaw = async (data: Uint8Array) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DOCX extraction is not supported in this browser. Please try a PDF resume.');
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const readUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

const extractDocxText = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 30 < bytes.length) {
    if (readUint32(view, offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = readUint16(view, offset + 8);
    const compressedSize = readUint32(view, offset + 18);
    const fileNameLength = readUint16(view, offset + 26);
    const extraLength = readUint16(view, offset + 28);
    const fileNameStart = offset + 30;
    const fileName = decoder.decode(bytes.slice(fileNameStart, fileNameStart + fileNameLength));
    const dataStart = fileNameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (fileName === 'word/document.xml') {
      const compressedData = bytes.slice(dataStart, dataEnd);
      const documentBytes = compressionMethod === 0
        ? compressedData
        : await inflateRaw(compressedData);
      return stripXml(decoder.decode(documentBytes));
    }

    offset = dataEnd;
  }

  throw new Error('Unable to read text from this DOCX file.');
};

type PdfRuntimeLoader = typeof loadPdfJsRuntime;

export const extractPdfResumeText = async (file: File, loadRuntime: PdfRuntimeLoader = loadPdfJsRuntime) => {
  let loadingTask: ReturnType<Awaited<ReturnType<PdfRuntimeLoader>>['getDocument']> | undefined;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdfjsLib = await loadRuntime();
    loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const layoutItems = textContent.items.flatMap<ResumePdfTextItem>(item => {
        if (!('str' in item) || !item.str.trim()) return [];
        const [, , , transformHeight, x, y] = item.transform;
        return [{
          text: item.str,
          x,
          y,
          width: item.width,
          height: Math.abs(transformHeight) || item.height || 1,
          hasEOL: item.hasEOL
        }];
      });
      pageTexts.push(reconstructResumePdfPage(layoutItems, viewport.width));
    }

    const text = pageTexts.filter(Boolean).join('\n\n--- PAGE BREAK ---\n\n').trim();
    if (!text) {
      throw new ResumeImportError('pdf_empty_text', 'text-validation', 'PDF extraction returned no text.');
    }
    return text;
  } catch (error) {
    throw classifyPdfFailure(error);
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
};

export const extractChefResumeText = async (file: File) => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfResumeText(file);
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    try {
      const text = await extractDocxText(file);
      if (!text) throw new Error('DOCX extraction returned no text.');
      return text;
    } catch (error) {
      throw new ResumeImportError('docx_parse_failed', 'text-validation', 'DOCX extraction failed.', { cause: error });
    }
  }

  throw new ResumeImportError('unsupported_file', 'validation', 'Resume Auto Fill supports PDF and DOCX files.');
};
