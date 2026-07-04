import type { PortfolioResume } from '../types';

interface ResumePreviewProps {
  resume?: PortfolioResume;
}

export default function ResumePreview({ resume }: ResumePreviewProps) {
  if (!resume || resume.visibility !== 'public' || !resume.fileUrl) return null;

  const displayName = resume.displayName?.trim() || resume.fileName || 'Resume';

  return (
    <section className="animate-fade-in pb-10">
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8 shadow-sm space-y-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Resume</p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">{displayName}</h3>
        </div>

        <p className="font-sans text-sm font-bold text-on-surface-variant">Professional resume available as PDF.</p>

        {resume.allowDownload ? (
          <a href={resume.fileUrl} download={resume.fileName || displayName} className="inline-flex rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
            Download Resume
          </a>
        ) : (
          <a href={resume.fileUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">
            View Resume
          </a>
        )}
      </div>
    </section>
  );
}
