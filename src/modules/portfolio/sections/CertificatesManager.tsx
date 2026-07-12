import { useState, type ChangeEvent, type FormEvent } from 'react';
import { uploadPortfolioCertificatePdf, uploadPortfolioCertificateThumbnail } from '../../../services/storage';
import type { PortfolioCertificate, PortfolioVisibility } from '../types';

interface CertificatesManagerProps {
  certificates: PortfolioCertificate[];
  userId?: string;
  onChange: (certificates: PortfolioCertificate[]) => void;
}

type CertificateDraft = Omit<PortfolioCertificate, 'id' | 'sortOrder'>;

const emptyDraft: CertificateDraft = {
  title: '',
  issuer: '',
  issueDate: '',
  expiryDate: '',
  credentialId: '',
  credentialUrl: '',
  description: '',
  skillsCertified: [],
  pdfFileName: '',
  pdfUrl: '',
  thumbnailFileName: '',
  thumbnailUrl: '',
  visibility: 'public',
  showPublicly: true
};

const normalizeCertificateOrder = (items: PortfolioCertificate[]) => (
  items.map((item, index) => ({
    ...item,
    sortOrder: index
  }))
);

const getSortedCertificates = (items: PortfolioCertificate[]) => (
  [...items].sort((a, b) => a.sortOrder - b.sortOrder)
);

const createCertificateId = () => 'certificate_' + Date.now();

export default function CertificatesManager({ certificates, userId, onChange }: CertificatesManagerProps) {
  const [draft, setDraft] = useState<CertificateDraft>(emptyDraft);
  const [draftId, setDraftId] = useState(createCertificateId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [thumbnailProgress, setThumbnailProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');

  const sortedCertificates = getSortedCertificates(certificates);

  const updateDraft = (field: keyof CertificateDraft, value: string | boolean | string[]) => {
    setDraft(current => ({
      ...current,
      [field]: value
    }));
  };

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setUploadError('Sign in to upload certificate files.');
      event.target.value = '';
      return;
    }

    setPdfProgress(0);
    setUploadError('');

    try {
      const pdfUrl = await uploadPortfolioCertificatePdf({
        userId,
        certificateId: editingId || draftId,
        file,
        onProgress: setPdfProgress,
      });
      updateDraft('pdfFileName', file.name);
      updateDraft('pdfUrl', pdfUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload certificate PDF.');
    } finally {
      setPdfProgress(null);
      event.target.value = '';
    }
  };

  const handleThumbnailUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setUploadError('Sign in to upload certificate thumbnails.');
      event.target.value = '';
      return;
    }

    setThumbnailProgress(0);
    setUploadError('');

    try {
      const thumbnailUrl = await uploadPortfolioCertificateThumbnail({
        userId,
        certificateId: editingId || draftId,
        file,
        onProgress: setThumbnailProgress,
      });
      updateDraft('thumbnailFileName', file.name);
      updateDraft('thumbnailUrl', thumbnailUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload certificate thumbnail.');
    } finally {
      setThumbnailProgress(null);
      event.target.value = '';
    }
  };

  const removePdf = () => {
    updateDraft('pdfFileName', '');
    updateDraft('pdfUrl', '');
  };

  const removeThumbnail = () => {
    updateDraft('thumbnailFileName', '');
    updateDraft('thumbnailUrl', '');
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
    setDraftId(createCertificateId());
    setEditingId(null);
    setValidationMessage('');
    setUploadError('');
    setPdfProgress(null);
    setThumbnailProgress(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    setValidationMessage('');
    if (!title) {
      setValidationMessage('Add a certificate title before adding this certificate.');
      return;
    }

    const cleanDraft: CertificateDraft = {
      ...draft,
      title,
      issuer: draft.issuer?.trim(),
      issueDate: draft.issueDate?.trim(),
      expiryDate: draft.expiryDate?.trim(),
      credentialId: draft.credentialId?.trim(),
      credentialUrl: draft.credentialUrl?.trim(),
      description: draft.description?.trim(),
      skillsCertified: draft.skillsCertified?.map(item => item.trim()).filter(Boolean) || [],
      pdfFileName: draft.pdfFileName?.trim(),
      pdfUrl: draft.pdfUrl?.trim(),
      thumbnailFileName: draft.thumbnailFileName?.trim(),
      thumbnailUrl: draft.thumbnailUrl?.trim()
    };

    if (editingId) {
      onChange(normalizeCertificateOrder(sortedCertificates.map(item => (
        item.id === editingId ? { ...item, ...cleanDraft } : item
      ))));
      resetDraft();
      return;
    }

    onChange(normalizeCertificateOrder([
      ...sortedCertificates,
      {
        ...cleanDraft,
        id: draftId,
        sortOrder: sortedCertificates.length
      }
    ]));
    resetDraft();
  };

  const startEdit = (certificate: PortfolioCertificate) => {
    setDraft({
      title: certificate.title,
      issuer: certificate.issuer || '',
      issueDate: certificate.issueDate || '',
      expiryDate: certificate.expiryDate || '',
      credentialId: certificate.credentialId || '',
      credentialUrl: certificate.credentialUrl || '',
      description: certificate.description || '',
      skillsCertified: certificate.skillsCertified || [],
      pdfFileName: certificate.pdfFileName || '',
      pdfUrl: certificate.pdfUrl || '',
      thumbnailFileName: certificate.thumbnailFileName || '',
      thumbnailUrl: certificate.thumbnailUrl || '',
      visibility: certificate.visibility,
      showPublicly: certificate.showPublicly
    });
    setDraftId(certificate.id);
    setEditingId(certificate.id);
  };

  const deleteCertificate = (id: string) => {
    onChange(normalizeCertificateOrder(sortedCertificates.filter(item => item.id !== id)));
    if (editingId === id) resetDraft();
  };

  const toggleVisibility = (id: string) => {
    onChange(sortedCertificates.map(item => {
      if (item.id !== id) return item;
      const nextVisibility: PortfolioVisibility = item.visibility === 'public' ? 'private' : 'public';
      return {
        ...item,
        visibility: nextVisibility
      };
    }));
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Chef Profile Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          Certificates
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Title</span>
          <input type="text" required value={draft.title} onChange={event => updateDraft('title', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
          {validationMessage && <p className="font-sans text-xs font-bold text-secondary">{validationMessage}</p>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Issuer</span>
          <input type="text" value={draft.issuer || ''} onChange={event => updateDraft('issuer', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Issue Date</span>
          <input type="text" value={draft.issueDate || ''} onChange={event => updateDraft('issueDate', event.target.value)} placeholder="Jan 2024" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Expiry Date</span>
          <input type="text" value={draft.expiryDate || ''} onChange={event => updateDraft('expiryDate', event.target.value)} placeholder="Jan 2026" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Credential ID</span>
          <input type="text" value={draft.credentialId || ''} onChange={event => updateDraft('credentialId', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Credential URL</span>
          <input type="url" value={draft.credentialUrl || ''} onChange={event => updateDraft('credentialUrl', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Description</span>
          <textarea value={draft.description || ''} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Skills Certified</span>
          <input type="text" value={(draft.skillsCertified || []).join(', ')} onChange={event => updateDraft('skillsCertified', event.target.value.split(',').map(item => item.trim()).filter(Boolean))} placeholder="Knife skills, Food safety, Pastry" className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">PDF Upload</span>
          <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-sans file:text-xs file:font-extrabold file:text-on-primary" />
          {draft.pdfFileName && <span className="font-sans text-xs font-bold text-on-surface-variant">{draft.pdfFileName}</span>}
          {draft.pdfUrl && <button type="button" onClick={removePdf} className="block rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">Remove PDF</button>}
          {pdfProgress !== null && <span className="font-sans text-xs font-extrabold text-secondary">Uploading PDF... {pdfProgress}%</span>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Thumbnail Upload</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleThumbnailUpload} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-sans file:text-xs file:font-extrabold file:text-on-primary" />
          {draft.thumbnailFileName && <span className="font-sans text-xs font-bold text-on-surface-variant">{draft.thumbnailFileName}</span>}
          {draft.thumbnailUrl && <button type="button" onClick={removeThumbnail} className="block rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">Remove Thumbnail</button>}
          {thumbnailProgress !== null && <span className="font-sans text-xs font-extrabold text-secondary">Uploading thumbnail... {thumbnailProgress}%</span>}
        </label>

        {uploadError && (
          <p className="font-sans text-xs font-extrabold text-error md:col-span-2">{uploadError}</p>
        )}

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Visibility</span>
          <select value={draft.visibility} onChange={event => updateDraft('visibility', event.target.value as PortfolioVisibility)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-white px-4 py-3 md:mt-7">
          <input type="checkbox" checked={draft.showPublicly} onChange={event => updateDraft('showPublicly', event.target.checked)} className="h-4 w-4 accent-primary" />
          <span className="font-sans text-xs font-extrabold text-primary">Show Certificate Publicly</span>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all">
            {editingId ? 'Update Certificate' : 'Add Certificate'}
          </button>
          {editingId && (
            <button type="button" onClick={resetDraft} className="rounded-full border border-surface-container-high px-6 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {sortedCertificates.length > 0 ? sortedCertificates.map(certificate => (
          <article key={certificate.id} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
            <div className="flex gap-4">
              {certificate.thumbnailUrl && (
                <img src={certificate.thumbnailUrl} alt="" className="h-20 w-20 rounded-xl object-cover bg-surface-container" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                  {certificate.visibility === 'public' && certificate.showPublicly ? 'Public' : 'Private'}
                </p>
                <h4 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                  {certificate.title}
                </h4>
                {certificate.issuer && (
                  <p className="font-sans text-sm font-bold text-on-surface-variant">{certificate.issuer}</p>
                )}
                {(certificate.issueDate || certificate.expiryDate) && (
                  <p className="font-sans text-xs font-extrabold text-outline mt-1">
                    {[certificate.issueDate, certificate.expiryDate ? 'Expires ' + certificate.expiryDate : ''].filter(Boolean).join(' | ')}
                  </p>
                )}
              </div>
            </div>

            {certificate.description && (
              <p className="font-sans text-sm font-bold text-on-surface-variant">{certificate.description}</p>
            )}

            {certificate.skillsCertified && certificate.skillsCertified.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {certificate.skillsCertified.map(skill => (
                  <span key={skill} className="rounded-full bg-surface-container px-3 py-1 font-sans text-xs font-extrabold text-primary">{skill}</span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleVisibility(certificate.id)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle Visibility</button>
              <button type="button" onClick={() => startEdit(certificate)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Edit</button>
              <button type="button" onClick={() => deleteCertificate(certificate.id)} className="rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary">Delete</button>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-6 text-center lg:col-span-2">
            <p className="font-sans text-sm font-bold text-on-surface-variant">
              No certificates added yet. Add training, licenses, or awards that support your expertise.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
