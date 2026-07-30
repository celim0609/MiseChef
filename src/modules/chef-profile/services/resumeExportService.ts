import type { ChefProfile, ResumeExportSettings } from '../types';

const escapeHtml = (value?: string) => (value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character] || character));

const section = (title: string, body: string) => body ? `<section><h2>${title}</h2>${body}</section>` : '';
const list = (items: string[]) => items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
const formatDate = (month?: string, year?: string) => [month, year].filter(Boolean).join(' ');

export const exportChefProfilePdf = (profile: ChefProfile, settings: ResumeExportSettings) => {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Allow pop-ups to export your resume.');
  const info = [
    settings.includeEmail && profile.basicInfo.email,
    settings.includePhone && profile.basicInfo.phone,
    settings.includeLocation && [profile.basicInfo.location, profile.basicInfo.country].filter(Boolean).join(', ')
  ].filter(Boolean).map(value => escapeHtml(String(value))).join(' · ');
  const experiences = profile.experiences.map(item => `
    <article><h3>${escapeHtml(item.jobTitle)}${item.companyName ? ` · ${escapeHtml(item.companyName)}` : ''}</h3>
    <p class="meta">${escapeHtml(formatDate(item.startMonth, item.startYear))} – ${item.currentlyWorking ? 'Present' : escapeHtml(formatDate(item.endMonth, item.endYear))}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</p>
    ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}</article>`).join('');
  const education = profile.education.map(item => `<article><h3>${escapeHtml(item.qualification || item.fieldOfStudy)}${item.schoolName ? ` · ${escapeHtml(item.schoolName)}` : ''}</h3><p class="meta">${escapeHtml([item.startYear, item.endYear].filter(Boolean).join(' – '))}</p>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}</article>`).join('');
  const certificates = settings.includeCertificates ? list(profile.certificates.map(item => [item.name, item.issuingOrganisation, item.issueDate].filter(Boolean).join(' · '))) : '';
  const awards = settings.includeAwards ? list(profile.awards.map(item => [item.name, item.issuingOrganisation, item.year].filter(Boolean).join(' · '))) : '';
  const links = [
    settings.includePortfolioLink && profile.socialLinks.website,
    settings.includeMiseChefProfileLink && profile.visibility === 'public' && profile.profileSlug && `${location.origin}/@${profile.profileSlug}`
  ].filter(Boolean).map(String);

  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(profile.basicInfo.fullName)} — Resume</title>
  <style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:10.5pt/1.45 Arial,sans-serif;color:#20251f;margin:0}
    header{border-bottom:3px solid #365942;padding-bottom:12px;margin-bottom:18px}.top{display:flex;gap:16px;align-items:center}
    img{width:76px;height:76px;border-radius:50%;object-fit:cover}h1{font-size:24pt;margin:0;color:#294735}h2{font-size:11pt;letter-spacing:.08em;text-transform:uppercase;color:#365942;border-bottom:1px solid #cfd8d0;padding-bottom:4px;margin:18px 0 8px}
    h3{font-size:10.5pt;margin:0 0 2px}p{margin:4px 0}.title{font-size:13pt;color:#59655c}.meta{font-size:9pt;color:#687268}section,article{break-inside:avoid}article{margin-bottom:10px}ul{margin:4px 0;padding-left:18px}.skills{display:flex;flex-wrap:wrap;gap:5px}.skills span{border:1px solid #cfd8d0;border-radius:12px;padding:3px 8px}
    .links{font-size:9pt;margin-top:18px}@media print{.print{display:none}}
  </style></head><body><header><div class="top">
  ${settings.includeProfilePhoto && profile.basicInfo.profilePhotoUrl ? `<img src="${escapeHtml(profile.basicInfo.profilePhotoUrl)}" alt="">` : ''}
  <div><h1>${escapeHtml(profile.basicInfo.fullName)}</h1><div class="title">${escapeHtml(profile.basicInfo.professionalTitle)}</div><p>${info}</p></div></div></header>
  ${section('Professional Summary', profile.basicInfo.summary ? `<p>${escapeHtml(profile.basicInfo.summary)}</p>` : '')}
  ${section('Skills', profile.skills.length ? `<div class="skills">${profile.skills.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '')}
  ${section('Work Experience', experiences)}${section('Education', education)}
  ${section('Certificates', certificates)}${section('Awards', awards)}
  ${section('Languages', list(profile.languages.map(item => [item.language, item.proficiency].filter(Boolean).join(' · '))))}
  ${links.length ? `<div class="links">${links.map(link => escapeHtml(link)).join('<br>')}</div>` : ''}
  <button class="print" onclick="window.print()" style="margin-top:20px;padding:10px 16px">Save as PDF</button>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))</script></body></html>`);
  popup.document.close();
};
