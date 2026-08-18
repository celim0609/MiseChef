import type { GeminiResumePortfolioDraft } from '../../../services/resumePortfolioModel';
import { mapResumeDraftToChefProfile as mapResumeDraft } from './resumeImportMapping';
import { isResumeImportError, ResumeImportError } from './resumeImportErrors';

type ResumeParser = (text: string, workspaceId: string) => Promise<GeminiResumePortfolioDraft>;

const isNetworkFailure = (error: unknown) => {
  const code = typeof error === 'object' && error ? String((error as { code?: unknown }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error || '');
  const cause = error instanceof Error ? error.cause : undefined;
  const causeCode = typeof cause === 'object' && cause ? String((cause as { code?: unknown }).code || '') : '';
  const causeMessage = cause instanceof Error ? cause.message : String(cause || '');
  return /network|unavailable|deadline-exceeded|timeout|failed to fetch/i.test(`${code} ${message} ${causeCode} ${causeMessage}`);
};

export const parseExtractedResumeText = async (text: string, workspaceId: string, parser: ResumeParser) => {
  if (text.trim().length < 80) {
    throw new ResumeImportError('resume_text_too_short', 'text-validation', 'Extracted resume text is too short to parse reliably.');
  }
  try {
    const parsed = await parser(text, workspaceId);
    if (parsed.unmappedSections?.length) {
      console.warn('[Resume Import] Unmapped resume sections', parsed.unmappedSections.map(section => ({
        sectionName: section.sectionName,
        reason: section.reason
      })));
    }
    return mapResumeDraft(parsed);
  } catch (error) {
    if (isResumeImportError(error)) throw error;
    throw new ResumeImportError(
      isNetworkFailure(error) ? 'resume_parser_network_failed' : 'resume_parser_failed',
      'resume-parser',
      error instanceof Error ? error.message : 'Resume parser failed.',
      { cause: error }
    );
  }
};
