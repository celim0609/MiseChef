import type { PortfolioCertificate } from '../types';

interface CertificatesPreviewProps {
  certificates: PortfolioCertificate[];
}

const getPublicCertificates = (certificates: PortfolioCertificate[]) => (
  certificates
    .filter(certificate => certificate.visibility === 'public' && certificate.showPublicly)
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function CertificatesPreview({ certificates }: CertificatesPreviewProps) {
  const publicCertificates = getPublicCertificates(certificates);

  if (publicCertificates.length === 0) return null;

  return (
    <section className="animate-fade-in pb-10">
      <div className="space-y-4">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            Certificates
          </p>
          <h3 className="font-display text-3xl font-bold text-primary tracking-tight mt-1">
            Professional Credentials
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {publicCertificates.map(certificate => (
            <article key={certificate.id} className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex gap-4">
                {certificate.thumbnailUrl && (
                  <img src={certificate.thumbnailUrl} alt="" className="h-24 w-24 rounded-xl object-cover bg-surface-container" />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-2xl font-bold text-primary tracking-tight">
                    {certificate.title}
                  </h4>
                  {certificate.issuer && (
                    <p className="font-sans text-sm font-bold text-on-surface-variant mt-1">{certificate.issuer}</p>
                  )}
                  {(certificate.issueDate || certificate.expiryDate) && (
                    <p className="font-sans text-xs font-extrabold text-outline mt-2">
                      {[certificate.issueDate, certificate.expiryDate ? 'Expires ' + certificate.expiryDate : ''].filter(Boolean).join(' | ')}
                    </p>
                  )}
                  {certificate.credentialId && (
                    <p className="font-sans text-xs font-extrabold text-outline mt-1">
                      Credential ID: {certificate.credentialId}
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
                    <span key={skill} className="rounded-full bg-white px-3 py-1 font-sans text-xs font-extrabold text-primary">{skill}</span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {certificate.credentialUrl && (
                  <a href={certificate.credentialUrl} target="_blank" rel="noreferrer" className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary">
                    View Credential
                  </a>
                )}
                {certificate.pdfUrl && (
                  <a href={certificate.pdfUrl} target="_blank" rel="noreferrer" className="rounded-full border border-surface-container-high px-4 py-2 font-sans text-xs font-extrabold text-primary">
                    View PDF
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
