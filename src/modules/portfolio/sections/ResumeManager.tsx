import { useRef, useState, type ChangeEvent } from 'react';
import { uploadPortfolioResume } from '../../../services/storage';
import type { ResumeImportSummary } from '../services/resumeImportService';
import type { PortfolioResume, PortfolioVisibility } from '../types';

interface ResumeManagerProps {
  resume: PortfolioResume;
  userId?: string;
  onChange: (resume: PortfolioResume) => void;
  onImportFromResume: (file: File) => Promise<ResumeImportSummary>;
}

export default function ResumeManager({ resume, userId, onChange, onImportFromResume }: ResumeManagerProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState<ResumeImportSummary | null>(null);

  const updateResume = (field: keyof PortfolioResume, value: string | boolean) => {
    onChange({
      ...resume,
      [field]: value
    });
  };

  const handleResumeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setUploadError('Sign in to upload a resume.');
      event.target.value = '';
      return;
    }

    setUploadProgress(0);
    setUploadError('');

    try {
      const fileUrl = await uploadPortfolioResume({
        userId,
        file,
        onProgress: setUploadProgress,
      });

      onChange({
        ...resume,
        fileName: file.name,
        fileUrl,
        displayName: resume.displayName || file.name.replace(/\.pdf$/i, '')
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload resume.');
    } finally {
      setUploadProgress(null);
      event.target.value = '';
    }
  };

  const removeResume = () => {
    setUploadError('');
    onChange({
      ...resume,
      fileName: '',
      fileUrl: ''
    });
  };

  const handleResumeImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isSupported = file.type === 'application/pdf'
      || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || /\.(pdf|docx)$/i.test(file.name);

    if (!isSupported) {
      setImportError('Resume Auto Fill supports PDF and DOCX files.');
      event.target.value = '';
      return;
    }

    setIsImporting(true);
    setImportError('');
    setImportSummary(null);

    try {
      const summary = await onImportFromResume(file);
      setImportSummary(summary);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Resume Auto Fill failed. Please try again.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Portfolio Studio</p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Resume</h3>
      </div>

      <div className="rounded-2xl border border-surface-container-high bg-white p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sans text-xs font-extrabold text-primary">Resume Auto Fill</p>
            <p className="font-sans text-sm font-bold text-on-surface-variant mt-1">Import PDF or DOCX resume text into your Portfolio draft.</p>
          </div>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            {isImporting ? 'Importing...' : '🤖 Import from Resume'}
          </button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
          onChange={handleResumeImport}
          className="hidden"
        />

        {isImporting && <p className="font-sans text-xs font-extrabold text-secondary">Reading resume and preparing Portfolio draft...</p>}
        {importError && <p className="font-sans text-xs font-extrabold text-error">{importError}</p>}
        {importSummary && (
          <div className="rounded-xl bg-surface-container-low p-4">
            <p className="font-sans text-xs font-extrabold text-primary uppercase tracking-[0.16em]">Imported</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {importSummary.experiences > 0 && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ {importSummary.experiences} Experiences</span>}
              {importSummary.skills > 0 && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ {importSummary.skills} Skills</span>}
              {importSummary.certificates > 0 && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ {importSummary.certificates} Certificates</span>}
              {importSummary.about && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ About</span>}
              {importSummary.basicProfile && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ Basic Profile</span>}
              {importSummary.contact && <span className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">✓ Contact</span>}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Upload Resume PDF</span>
          <input type="file" accept="application/pdf" onChange={handleResumeUpload} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-sans file:text-xs file:font-extrabold file:text-on-primary" />
          {resume.fileName && <span className="font-sans text-xs font-bold text-on-surface-variant">{resume.fileName}</span>}
          {resume.fileUrl && <button type="button" onClick={removeResume} className="block rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">Remove Resume</button>}
          {uploadProgress !== null && <span className="font-sans text-xs font-extrabold text-secondary">Uploading resume... {uploadProgress}%</span>}
          {uploadError && <span className="font-sans text-xs font-extrabold text-error">{uploadError}</span>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Resume Display Name</span>
          <input type="text" value={resume.displayName || ''} onChange={event => updateResume('displayName', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Visibility</span>
          <select value={resume.visibility} onChange={event => updateResume('visibility', event.target.value as PortfolioVisibility)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3 md:mt-7">
          <input type="checkbox" checked={resume.allowDownload} onChange={event => updateResume('allowDownload', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Allow Download</span>
        </label>
      </div>
    </section>
  );
}
