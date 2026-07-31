import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileText, Pencil, Plus, Shield, Sparkles, Upload, UserRound, X } from 'lucide-react';
import { uploadPortfolioCertificatePdf, uploadUserProfilePhoto } from '../../services/storage';
import type { Recipe } from '../../types';
import type { Portfolio, PortfolioProfileSource } from '../portfolio/types';
import { calculateCompletion, DEFAULT_SKILLS, emptyChefProfile, getNextAction, sanitizeProfile, slugifyProfile } from './model';
import { chefProfileService } from './services/chefProfileService';
import { exportChefProfilePdf } from './services/resumeExportService';
import { importResume } from './services/resumeImportService';
import type { ChefAward, ChefCertificate, ChefEducation, ChefExperience, ChefLanguage, ChefProfile, ImportedChefProfile, ResumeExportSettings } from './types';

interface ChefProfilePageProps {
  profile: PortfolioProfileSource;
  initialPortfolio: Portfolio;
  recipes: Recipe[];
  userId?: string;
  workspaceId?: string;
}

const STEPS = ['Basic Information', 'Skills', 'Work Experience', 'Education', 'Certificates', 'Awards & Languages', 'Social Links', 'Review & Publish'];
const fieldClass = 'w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary';
const labelClass = 'space-y-2 font-sans text-xs font-extrabold text-primary';
const emptyExperience = (): ChefExperience => ({ id: crypto.randomUUID(), jobTitle: '', companyName: '', currentlyWorking: false });
const emptyEducation = (): ChefEducation => ({ id: crypto.randomUUID(), schoolName: '' });
const emptyCertificate = (): ChefCertificate => ({ id: crypto.randomUUID(), name: '', showPublicly: false });
const emptyAward = (): ChefAward => ({ id: crypto.randomUUID(), name: '' });
const emptyLanguage = (): ChefLanguage => ({ id: crypto.randomUUID(), language: '' });
const exportDefaults: ResumeExportSettings = {
  includeProfilePhoto: true, includeEmail: true, includePhone: false, includeLocation: true,
  includeCertificates: true, includeAwards: true, includePortfolioLink: true, includeMiseChefProfileLink: true
};

const Card = ({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) => (
  <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-5 shadow-sm sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-display text-xl font-bold text-primary">{icon}{title}</h3>{action}
    </div>
    {children}
  </section>
);

const TextField = ({ label, value, onChange, type = 'text', placeholder = '' }: { key?: string; label: string; value?: string; onChange: (value: string) => void; type?: string; placeholder?: string }) => (
  <label className={labelClass}><span>{label}</span><input type={type} value={value || ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} className={fieldClass} /></label>
);

const RemoveButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label="Remove entry" className="rounded-full border border-error/20 p-2 text-error"><X className="h-4 w-4" /></button>
);

const mergeImport = (current: ChefProfile, imported: ImportedChefProfile, replace: boolean): ChefProfile => {
  const next = replace ? emptyChefProfile(current.userId, current.basicInfo.fullName, current.basicInfo.email) : current;
  return sanitizeProfile({
    ...next,
    basicInfo: {
      ...next.basicInfo,
      ...Object.fromEntries(Object.entries(imported.basicInfo).filter(([, value]) => Boolean(value)))
    },
    skills: replace ? imported.skills : [...new Set([...current.skills, ...imported.skills])],
    experiences: replace ? imported.experiences : [...current.experiences, ...imported.experiences],
    education: replace ? imported.education : [...current.education, ...imported.education],
    certificates: replace ? imported.certificates : [...current.certificates, ...imported.certificates],
    awards: replace ? imported.awards : [...current.awards, ...imported.awards],
    languages: replace ? imported.languages : [...current.languages, ...imported.languages],
    socialLinks: replace ? imported.socialLinks : { ...current.socialLinks, ...imported.socialLinks },
    portfolio: replace ? imported.portfolio : [...current.portfolio, ...imported.portfolio],
    profileSlug: current.profileSlug || imported.profileSlug
  });
};

export default function ChefProfilePage({ profile: account, initialPortfolio, userId, workspaceId }: ChefProfilePageProps) {
  const [profile, setProfile] = useState<ChefProfile | null>(null);
  const [screen, setScreen] = useState<'loading' | 'entry' | 'builder' | 'dashboard'>('loading');
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState('');
  const [importStage, setImportStage] = useState<0 | 1 | 2 | 3>(0);
  const [imported, setImported] = useState<ImportedChefProfile | null>(null);
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [importError, setImportError] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [exportSettings, setExportSettings] = useState(exportDefaults);
  const [customSkill, setCustomSkill] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setScreen('entry');
      return;
    }
    chefProfileService.load(userId, initialPortfolio, workspaceId, account.displayName, account.email || '')
      .then(value => {
        setProfile(value);
        const hasMeaningfulData = Boolean(value?.basicInfo.fullName && value.basicInfo.professionalTitle);
        setScreen(hasMeaningfulData ? 'dashboard' : 'entry');
      })
      .catch(() => {
        setProfile(emptyChefProfile(userId, account.displayName, account.email || ''));
        setScreen('entry');
      });
  }, [userId, workspaceId, account.displayName, account.email, initialPortfolio]);

  const update = (recipe: (current: ChefProfile) => ChefProfile) => setProfile(current => current ? recipe(current) : current);
  const updateBasic = (key: keyof ChefProfile['basicInfo'], value: string) => update(current => ({
    ...current, basicInfo: { ...current.basicInfo, [key]: value }
  }));
  const completion = useMemo(() => profile ? calculateCompletion(profile) : 0, [profile]);

  const save = async (nextScreen?: 'builder' | 'dashboard', candidate = profile) => {
    if (!candidate || !userId) return;
    if (!candidate.basicInfo.fullName.trim() || !candidate.basicInfo.professionalTitle.trim()) {
      setSaveState('Full name and professional title are required.');
      setStep(0);
      return;
    }
    setSaveState('Saving...');
    try {
      const saved = await chefProfileService.save({ ...candidate, completionPercentage: calculateCompletion(candidate) });
      setProfile(saved);
      setSaveState('Changes saved');
      if (nextScreen) setScreen(nextScreen);
    } catch {
      setSaveState('We could not save your profile. Please try again.');
    }
  };

  const nextStep = async () => {
    if (step === 0 && (!profile?.basicInfo.fullName.trim() || !profile.basicInfo.professionalTitle.trim())) {
      setSaveState('Add your full name and professional title to continue.');
      return;
    }
    if (profile && userId) {
      setSaveState('Saving progress...');
      chefProfileService.save({ ...profile, completionPercentage: completion })
        .then(saved => { setProfile(saved); setSaveState('Progress saved'); })
        .catch(() => setSaveState('Progress will be saved when you finish.'));
    }
    setStep(value => Math.min(7, value + 1));
  };

  const handleResume = async (file?: File) => {
    if (!file || !profile || !userId) return;
    setImportError('');
    setImported(null);
    try {
      const result = await importResume(file, userId, workspaceId || userId, setImportStage);
      setImported(result.profile);
      setImportStage(0);
    } catch (error) {
      setImportStage(0);
      setImportError(error instanceof Error ? error.message : 'We could not read this resume. You can try another file or continue manually.');
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  const confirmImport = () => {
    if (!profile || !imported) return;
    setProfile(mergeImport(profile, imported, importMode === 'replace'));
    setImported(null);
    setStep(0);
    setScreen('builder');
    setSaveState('Imported information is ready for review. Nothing is saved until you confirm.');
  };

  const uploadPhoto = async (file?: File) => {
    if (!file || !userId) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setSaveState('Choose a JPG, PNG, or WEBP image under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setSaveState('Uploading photo...');
        const url = await uploadUserProfilePhoto({ userId, imageDataUrl: String(reader.result || '') });
        updateBasic('profilePhotoUrl', url);
        setSaveState('Photo uploaded');
      } catch {
        setSaveState('We could not upload this photo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadCertificate = async (certificateId: string, file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) {
      setSaveState('Certificate attachments must be PDF files under 10 MB.');
      return;
    }
    try {
      setSaveState('Uploading certificate...');
      const attachmentUrl = await uploadPortfolioCertificatePdf({ userId, certificateId, file });
      update(current => ({ ...current, certificates: current.certificates.map(item => item.id === certificateId ? { ...item, attachmentUrl } : item) }));
      setSaveState('Certificate uploaded');
    } catch {
      setSaveState('We could not upload this certificate.');
    }
  };

  if (screen === 'loading') return <div className="h-72 animate-pulse rounded-3xl bg-surface-container-low" aria-label="Loading Chef Profile" />;
  if (!userId || !profile) return <Card title="Chef Profile"><p className="font-sans text-sm font-bold text-on-surface-variant">Sign in to create your Chef Profile.</p></Card>;

  if (screen === 'entry') return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="font-sans text-xs font-extrabold uppercase tracking-[.18em] text-secondary">Chef Profile</p><h1 className="mt-2 font-display text-3xl font-bold text-primary">Create Your Chef Profile</h1><p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Choose how you want to begin.</p></div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Upload Resume" icon={<Upload className="h-5 w-5" />}>
          <p className="mb-5 font-sans text-sm font-bold text-on-surface-variant">Upload an existing PDF or DOCX resume and review every detail before saving.</p>
          <input ref={importInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => handleResume(event.target.files?.[0])} />
          <button type="button" disabled={importStage > 0} onClick={() => importInput.current?.click()} className="w-full rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">
            {importStage === 1 ? 'Uploading your resume' : importStage === 2 ? 'Reading your information' : importStage === 3 ? 'Preparing your profile' : 'Upload Resume'}
          </button>
        </Card>
        <Card title="Build Manually" icon={<Pencil className="h-5 w-5" />}>
          <p className="mb-5 font-sans text-sm font-bold text-on-surface-variant">Create your professional profile step by step. Optional sections can be skipped.</p>
          <button type="button" onClick={() => { setStep(0); setScreen('builder'); }} className="w-full rounded-full border border-primary px-5 py-3 font-sans text-sm font-extrabold text-primary">Start Manually</button>
        </Card>
      </div>
      {importError && <p role="alert" className="rounded-xl bg-error-container p-4 font-sans text-sm font-bold text-on-error-container">{importError}</p>}
      {imported && <ImportReview imported={imported} mode={importMode} onMode={setImportMode} onChange={setImported} onCancel={() => setImported(null)} onConfirm={confirmImport} />}
    </div>
  );

  if (screen === 'dashboard') return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-sans text-xs font-extrabold uppercase tracking-[.18em] text-secondary">Chef Profile</p><h1 className="mt-2 font-display text-3xl font-bold text-primary">{profile.basicInfo.fullName}</h1><p className="font-sans text-sm font-bold text-on-surface-variant">{profile.basicInfo.professionalTitle}</p></div>
        <div className="flex flex-wrap gap-2">
          {profile.visibility === 'public' && profile.profileSlug && <a href={`/@${profile.profileSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 font-sans text-xs font-extrabold text-primary"><Eye className="h-4 w-4" />View Profile</a>}
          <button type="button" onClick={() => { setStep(0); setScreen('builder'); }} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 font-sans text-xs font-extrabold text-on-primary"><Pencil className="h-4 w-4" />Edit Profile</button>
          <button type="button" onClick={() => setShowExport(true)} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 font-sans text-xs font-extrabold text-primary"><Download className="h-4 w-4" />Export Resume</button>
        </div>
      </div>
      <Card title={`${completion}% complete`} icon={<Check className="h-5 w-5" />}>
        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full rounded-full bg-secondary" style={{ width: `${completion}%` }} /></div>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Next: {getNextAction(profile)}</p>
        <p className="mt-1 font-sans text-xs font-extrabold text-secondary">{profile.visibility === 'public' ? 'Public profile' : 'Private profile'}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardSection title="Basic Information" value={[profile.basicInfo.fullName, profile.basicInfo.professionalTitle, profile.basicInfo.location].filter(Boolean).join(' · ')} onEdit={() => { setStep(0); setScreen('builder'); }} />
        <DashboardSection title="About" value={profile.basicInfo.summary || 'Not added'} onEdit={() => { setStep(0); setScreen('builder'); }} />
        <DashboardSection title="Skills" value={profile.skills.join(', ') || 'Not added'} onEdit={() => { setStep(1); setScreen('builder'); }} />
        <DashboardSection title="Work Experience" value={`${profile.experiences.length} ${profile.experiences.length === 1 ? 'entry' : 'entries'}`} onEdit={() => { setStep(2); setScreen('builder'); }} />
        <DashboardSection title="Education" value={`${profile.education.length} ${profile.education.length === 1 ? 'entry' : 'entries'}`} onEdit={() => { setStep(3); setScreen('builder'); }} />
        <DashboardSection title="Certificates" value={`${profile.certificates.length} ${profile.certificates.length === 1 ? 'entry' : 'entries'}`} onEdit={() => { setStep(4); setScreen('builder'); }} />
        <DashboardSection title="Awards & Languages" value={`${profile.awards.length} awards · ${profile.languages.length} languages`} onEdit={() => { setStep(5); setScreen('builder'); }} />
        <DashboardSection title="Social Links" value={Object.values(profile.socialLinks).filter(Boolean).join(' · ') || 'Not added'} onEdit={() => { setStep(6); setScreen('builder'); }} />
        <DashboardSection title="Portfolio" value={`${profile.portfolio.length} items`} onEdit={() => { setStep(7); setScreen('builder'); }} />
      </div>
      {showExport && <ExportModal profile={profile} settings={exportSettings} onSettings={setExportSettings} onClose={() => setShowExport(false)} />}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-sans text-xs font-extrabold uppercase tracking-[.18em] text-secondary">Chef Profile Builder</p><h1 className="mt-1 font-display text-3xl font-bold text-primary">{STEPS[step]}</h1><p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Step {step + 1} of {STEPS.length} · {saveState || 'Your progress is saved as you continue.'}</p></div>
        <button type="button" onClick={() => setScreen('dashboard')} className="rounded-full border border-surface-container-high p-2 text-primary" aria-label="Close builder"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, index) => <div key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-surface-container-high'}`} />)}</div>
      <Card title={STEPS[step]}>{renderStep(step, profile, update, updateBasic, customSkill, setCustomSkill, uploadPhoto, uploadCertificate)}</Card>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => step === 0 ? setScreen('entry') : setStep(value => value - 1)} className="inline-flex items-center gap-2 rounded-full border border-primary px-5 py-3 font-sans text-xs font-extrabold text-primary"><ChevronLeft className="h-4 w-4" />Back</button>
        {step < 7 ? <div className="flex gap-2">
          {step > 0 && <button type="button" onClick={nextStep} className="rounded-full px-4 py-3 font-sans text-xs font-extrabold text-on-surface-variant">Skip</button>}
          <button type="button" onClick={nextStep} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Save and Continue<ChevronRight className="h-4 w-4" /></button>
        </div> : <div className="flex gap-2">
          <button type="button" onClick={() => { const next = { ...profile, visibility: 'private' as const }; setProfile(next); save('dashboard', next); }} className="rounded-full border border-primary px-5 py-3 font-sans text-xs font-extrabold text-primary">Save as Private</button>
          <button type="button" onClick={() => { const next = { ...profile, visibility: 'public' as const, profileSlug: profile.profileSlug || slugifyProfile(profile.basicInfo.fullName) }; setProfile(next); save('dashboard', next); }} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Publish Profile</button>
        </div>}
      </div>
    </div>
  );
}

function renderStep(
  step: number,
  profile: ChefProfile,
  update: (recipe: (current: ChefProfile) => ChefProfile) => void,
  updateBasic: (key: keyof ChefProfile['basicInfo'], value: string) => void,
  customSkill: string,
  setCustomSkill: (value: string) => void,
  uploadPhoto: (file?: File) => void
  , uploadCertificate: (certificateId: string, file?: File) => void
) {
  const updateArray = <T extends { id: string }>(key: 'experiences' | 'education' | 'certificates' | 'awards' | 'languages', id: string, patch: Partial<T>) =>
    update(current => ({ ...current, [key]: (current[key] as unknown as T[]).map(item => item.id === id ? { ...item, ...patch } : item) }));
  const removeArray = (key: 'experiences' | 'education' | 'certificates' | 'awards' | 'languages', id: string) =>
    update(current => ({ ...current, [key]: current[key].filter(item => item.id !== id) }));

  if (step === 0) return <div className="grid gap-4 sm:grid-cols-2">
    <label className={`${labelClass} sm:col-span-2`}><span>Profile photo</span><div className="flex items-center gap-4">{profile.basicInfo.profilePhotoUrl ? <img src={profile.basicInfo.profilePhotoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : <div className="grid h-20 w-20 place-items-center rounded-full bg-surface-container-high"><UserRound className="h-7 w-7 text-outline" /></div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => uploadPhoto(event.target.files?.[0])} className="max-w-xs text-sm" /></div></label>
    <TextField label="Full name *" value={profile.basicInfo.fullName} onChange={value => updateBasic('fullName', value)} />
    <TextField label="Professional title *" value={profile.basicInfo.professionalTitle} onChange={value => updateBasic('professionalTitle', value)} placeholder="Executive Chef" />
    <TextField label="Location" value={profile.basicInfo.location} onChange={value => updateBasic('location', value)} />
    <TextField label="Country" value={profile.basicInfo.country} onChange={value => updateBasic('country', value)} />
    <label className={`${labelClass} sm:col-span-2`}><span>Professional summary</span><textarea value={profile.basicInfo.summary || ''} onChange={event => updateBasic('summary', event.target.value)} rows={5} className={fieldClass} /></label>
  </div>;
  if (step === 1) return <div className="space-y-5"><div className="flex flex-wrap gap-2">{DEFAULT_SKILLS.map(skill => {
    const active = profile.skills.includes(skill);
    return <button key={skill} type="button" onClick={() => update(current => ({ ...current, skills: active ? current.skills.filter(item => item !== skill) : [...current.skills, skill] }))} className={`rounded-full border px-4 py-2 font-sans text-xs font-extrabold ${active ? 'border-primary bg-primary text-on-primary' : 'border-surface-container-high bg-white text-primary'}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{skill}</button>;
  })}</div><div className="flex gap-2"><input value={customSkill} onChange={event => setCustomSkill(event.target.value)} placeholder="Add a custom skill" className={fieldClass} /><button type="button" onClick={() => { const skill = customSkill.trim(); if (skill && !profile.skills.includes(skill)) update(current => ({ ...current, skills: [...current.skills, skill] })); setCustomSkill(''); }} className="rounded-full bg-primary px-5 font-sans text-xs font-extrabold text-on-primary">Add</button></div></div>;
  if (step === 2) return <ArrayEditor items={profile.experiences} addLabel="Add work experience" onAdd={() => update(current => ({ ...current, experiences: [...current.experiences, emptyExperience()] }))} render={(item: ChefExperience) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="Job title" value={item.jobTitle} onChange={value => updateArray<ChefExperience>('experiences', item.id, { jobTitle: value })} /><TextField label="Company name" value={item.companyName} onChange={value => updateArray<ChefExperience>('experiences', item.id, { companyName: value })} /><TextField label="Location" value={item.location} onChange={value => updateArray<ChefExperience>('experiences', item.id, { location: value })} /><TextField label="Start year" value={item.startYear} onChange={value => updateArray<ChefExperience>('experiences', item.id, { startYear: value })} /><TextField label="End year" value={item.endYear} onChange={value => updateArray<ChefExperience>('experiences', item.id, { endYear: value })} /><label className="flex items-center gap-2 self-end py-3 font-sans text-sm font-bold"><input type="checkbox" checked={item.currentlyWorking} onChange={event => updateArray<ChefExperience>('experiences', item.id, { currentlyWorking: event.target.checked })} />Currently working here</label><label className={`${labelClass} sm:col-span-2`}><span>Description</span><textarea value={item.description || ''} onChange={event => updateArray<ChefExperience>('experiences', item.id, { description: event.target.value })} rows={3} className={fieldClass} /></label><RemoveButton onClick={() => removeArray('experiences', item.id)} /></div>} />;
  if (step === 3) return <ArrayEditor items={profile.education} addLabel="Add education" onAdd={() => update(current => ({ ...current, education: [...current.education, emptyEducation()] }))} render={(item: ChefEducation) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="School name" value={item.schoolName} onChange={value => updateArray<ChefEducation>('education', item.id, { schoolName: value })} /><TextField label="Qualification" value={item.qualification} onChange={value => updateArray<ChefEducation>('education', item.id, { qualification: value })} /><TextField label="Field of study" value={item.fieldOfStudy} onChange={value => updateArray<ChefEducation>('education', item.id, { fieldOfStudy: value })} /><TextField label="Start year" value={item.startYear} onChange={value => updateArray<ChefEducation>('education', item.id, { startYear: value })} /><TextField label="End year" value={item.endYear} onChange={value => updateArray<ChefEducation>('education', item.id, { endYear: value })} /><label className={`${labelClass} sm:col-span-2`}><span>Description</span><textarea value={item.description || ''} onChange={event => updateArray<ChefEducation>('education', item.id, { description: event.target.value })} rows={3} className={fieldClass} /></label><RemoveButton onClick={() => removeArray('education', item.id)} /></div>} />;
  if (step === 4) return <ArrayEditor items={profile.certificates} addLabel="Add certificate" onAdd={() => update(current => ({ ...current, certificates: [...current.certificates, emptyCertificate()] }))} render={(item: ChefCertificate) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="Certificate name" value={item.name} onChange={value => updateArray<ChefCertificate>('certificates', item.id, { name: value })} /><TextField label="Issuing organisation" value={item.issuingOrganisation} onChange={value => updateArray<ChefCertificate>('certificates', item.id, { issuingOrganisation: value })} /><TextField label="Issue date" type="date" value={item.issueDate} onChange={value => updateArray<ChefCertificate>('certificates', item.id, { issueDate: value })} /><TextField label="Expiry date" type="date" value={item.expiryDate} onChange={value => updateArray<ChefCertificate>('certificates', item.id, { expiryDate: value })} /><TextField label="Credential URL" type="url" value={item.credentialUrl} onChange={value => updateArray<ChefCertificate>('certificates', item.id, { credentialUrl: value })} /><label className={labelClass}><span>Attachment (PDF)</span><input type="file" accept="application/pdf,.pdf" onChange={event => uploadCertificate(item.id, event.target.files?.[0])} className="text-sm font-bold" />{item.attachmentUrl && <span className="text-secondary">Uploaded privately</span>}</label><label className="flex items-center gap-2 self-end py-3 font-sans text-sm font-bold"><input type="checkbox" checked={item.showPublicly === true} onChange={event => updateArray<ChefCertificate>('certificates', item.id, { showPublicly: event.target.checked })} />Show certificate details publicly</label><RemoveButton onClick={() => removeArray('certificates', item.id)} /></div>} />;
  if (step === 5) return <div className="space-y-8"><ArrayEditor title="Awards" items={profile.awards} addLabel="Add award" onAdd={() => update(current => ({ ...current, awards: [...current.awards, emptyAward()] }))} render={(item: ChefAward) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="Award name" value={item.name} onChange={value => updateArray<ChefAward>('awards', item.id, { name: value })} /><TextField label="Issuing organisation" value={item.issuingOrganisation} onChange={value => updateArray<ChefAward>('awards', item.id, { issuingOrganisation: value })} /><TextField label="Year" value={item.year} onChange={value => updateArray<ChefAward>('awards', item.id, { year: value })} /><RemoveButton onClick={() => removeArray('awards', item.id)} /></div>} /><ArrayEditor title="Languages" items={profile.languages} addLabel="Add language" onAdd={() => update(current => ({ ...current, languages: [...current.languages, emptyLanguage()] }))} render={(item: ChefLanguage) => <div className="grid gap-3 sm:grid-cols-2"><TextField label="Language" value={item.language} onChange={value => updateArray<ChefLanguage>('languages', item.id, { language: value })} /><label className={labelClass}><span>Proficiency</span><select value={item.proficiency || ''} onChange={event => updateArray<ChefLanguage>('languages', item.id, { proficiency: event.target.value })} className={fieldClass}><option value="">Select</option><option>Basic</option><option>Conversational</option><option>Professional</option><option>Native</option></select></label><RemoveButton onClick={() => removeArray('languages', item.id)} /></div>} /></div>;
  if (step === 6) return <div className="grid gap-4 sm:grid-cols-2">{(['instagram', 'tiktok', 'facebook', 'linkedin', 'youtube', 'website'] as const).map(key => <TextField key={key} label={key === 'website' ? 'Personal website' : key[0].toUpperCase() + key.slice(1)} type="url" value={profile.socialLinks[key]} onChange={value => update(current => ({ ...current, socialLinks: { ...current.socialLinks, [key]: value } }))} />)}</div>;
  return <div className="space-y-5"><div className="rounded-2xl bg-white p-5"><div className="flex items-center gap-4">{profile.basicInfo.profilePhotoUrl && <img src={profile.basicInfo.profilePhotoUrl} className="h-16 w-16 rounded-full object-cover" alt="" />}<div><h2 className="font-display text-2xl font-bold text-primary">{profile.basicInfo.fullName || 'Needs Review'}</h2><p className="font-sans text-sm font-bold text-on-surface-variant">{profile.basicInfo.professionalTitle || 'Needs Review'}</p></div></div>{profile.basicInfo.summary && <p className="mt-4 font-sans text-sm leading-relaxed">{profile.basicInfo.summary}</p>}</div><ReviewLine label="Skills" value={`${profile.skills.length} selected`} /><ReviewLine label="Work Experience" value={`${profile.experiences.length} entries`} /><ReviewLine label="Education" value={`${profile.education.length} entries`} /><ReviewLine label="Certificates" value={`${profile.certificates.length} entries`} /><ReviewLine label="Awards" value={`${profile.awards.length} entries`} /><ReviewLine label="Languages" value={`${profile.languages.length} entries`} />
    <div className="space-y-3"><h3 className="font-display text-xl font-bold text-primary">Portfolio</h3>{profile.portfolio.map(item => <div key={item.id} className="grid gap-3 rounded-2xl border border-surface-container-high bg-white p-4 sm:grid-cols-2"><TextField label="Title" value={item.title} onChange={value => update(current => ({ ...current, portfolio: current.portfolio.map(entry => entry.id === item.id ? { ...entry, title: value } : entry) }))} /><TextField label="Project URL" type="url" value={item.projectUrl} onChange={value => update(current => ({ ...current, portfolio: current.portfolio.map(entry => entry.id === item.id ? { ...entry, projectUrl: value } : entry) }))} /><TextField label="Image URL" type="url" value={item.imageUrl} onChange={value => update(current => ({ ...current, portfolio: current.portfolio.map(entry => entry.id === item.id ? { ...entry, imageUrl: value } : entry) }))} /><label className={`${labelClass} sm:col-span-2`}><span>Description</span><textarea value={item.description || ''} onChange={event => update(current => ({ ...current, portfolio: current.portfolio.map(entry => entry.id === item.id ? { ...entry, description: event.target.value } : entry) }))} rows={2} className={fieldClass} /></label><RemoveButton onClick={() => update(current => ({ ...current, portfolio: current.portfolio.filter(entry => entry.id !== item.id) }))} /></div>)}<button type="button" onClick={() => update(current => ({ ...current, portfolio: [...current.portfolio, { id: crypto.randomUUID(), title: '', description: '', imageUrl: '' }] }))} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 font-sans text-xs font-extrabold text-primary"><Plus className="h-4 w-4" />Add portfolio item</button></div>
    <TextField label="Public profile slug" value={profile.profileSlug} onChange={value => update(current => ({ ...current, profileSlug: slugifyProfile(value) }))} /><p className="flex items-center gap-2 font-sans text-xs font-bold text-on-surface-variant"><Shield className="h-4 w-4" />Only published profile fields will be shown publicly. Private contact and files stay hidden.</p></div>;
}

function ArrayEditor<T>({ title, items, addLabel, onAdd, render }: { title?: string; items: T[]; addLabel: string; onAdd: () => void; render: (item: T) => ReactNode }) {
  return <div className="space-y-4">{title && <h3 className="font-display text-xl font-bold text-primary">{title}</h3>}{items.map((item, index) => <div key={(item as { id?: string }).id || index} className="rounded-2xl border border-surface-container-high bg-white p-4">{render(item)}</div>)}<button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2.5 font-sans text-xs font-extrabold text-primary"><Plus className="h-4 w-4" />{addLabel}</button></div>;
}

const ReviewLine = ({ label, value }: { label: string; value: string }) => <div className="flex items-center justify-between rounded-xl border border-surface-container-high bg-white px-4 py-3"><span className="font-sans text-sm font-extrabold text-primary">{label}</span><span className="font-sans text-sm font-bold text-on-surface-variant">{value}</span></div>;
const DashboardSection = ({ title, value, onEdit }: { title: string; value: string; onEdit: () => void }) => <Card title={title} action={<button type="button" onClick={onEdit} className="rounded-full border border-primary px-3 py-1.5 font-sans text-xs font-extrabold text-primary">Edit</button>}><p className="line-clamp-3 font-sans text-sm font-bold text-on-surface-variant">{value}</p></Card>;

function ImportReview({ imported, mode, onMode, onChange, onCancel, onConfirm }: { imported: ImportedChefProfile; mode: 'add' | 'replace'; onMode: (mode: 'add' | 'replace') => void; onChange: (profile: ImportedChefProfile) => void; onCancel: () => void; onConfirm: () => void }) {
  const incomplete = !imported.basicInfo.fullName || !imported.basicInfo.professionalTitle;
  return <div className="rounded-3xl border-2 border-secondary bg-surface-container-low p-5 sm:p-7">
    <div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 text-secondary" /><div><h2 className="font-display text-2xl font-bold text-primary">Review Your Imported Profile</h2><p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">We imported the information from your resume. Please review everything before saving.</p></div></div>
    {incomplete && <p className="mt-4 rounded-xl bg-tertiary-container p-3 font-sans text-xs font-extrabold text-on-tertiary-container">Needs Review: add your full name and check your professional title.</p>}
    {imported.summaryGeneratedByAi && imported.basicInfo.summary && <p className="mt-3 font-sans text-xs font-extrabold text-secondary">Professional summary prepared by AI — please review.</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><TextField label="Full name" value={imported.basicInfo.fullName} onChange={value => onChange({ ...imported, basicInfo: { ...imported.basicInfo, fullName: value } })} /><TextField label="Professional title" value={imported.basicInfo.professionalTitle} onChange={value => onChange({ ...imported, basicInfo: { ...imported.basicInfo, professionalTitle: value } })} /></div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3"><ReviewLine label="Skills" value={String(imported.skills.length)} /><ReviewLine label="Experience" value={String(imported.experiences.length)} /><ReviewLine label="Education" value={String(imported.education.length)} /><ReviewLine label="Certificates" value={String(imported.certificates.length)} /><ReviewLine label="Awards" value={String(imported.awards.length)} /><ReviewLine label="Languages" value={String(imported.languages.length)} /><ReviewLine label="Projects" value={String(imported.portfolio.length)} /><ReviewLine label="Contact" value={imported.basicInfo.email || imported.basicInfo.phone || imported.basicInfo.location ? 'Found' : 'Not found'} /></div>
    {Boolean(imported.unmappedSections?.length) && <div className="mt-4 rounded-xl bg-tertiary-container p-4 text-on-tertiary-container"><p className="font-sans text-xs font-extrabold">Sections needing manual review</p><ul className="mt-2 list-disc space-y-1 pl-5 font-sans text-xs font-bold">{imported.unmappedSections?.map((section, index) => <li key={`${section.sectionName}-${index}`}>{section.sectionName}{section.reason ? ` — ${section.reason}` : ''}</li>)}</ul></div>}
    <div className="mt-5"><p className="mb-2 font-sans text-xs font-extrabold text-primary">Existing profile handling</p><label className="mr-5 font-sans text-sm font-bold"><input type="radio" checked={mode === 'add'} onChange={() => onMode('add')} className="mr-2" />Add imported information</label><label className="font-sans text-sm font-bold"><input type="radio" checked={mode === 'replace'} onChange={() => onMode('replace')} className="mr-2" />Replace existing information</label></div>
    <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-full px-5 py-3 font-sans text-xs font-extrabold text-on-surface-variant">Cancel import</button><button type="button" onClick={onConfirm} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Review all sections</button></div>
  </div>;
}

function ExportModal({ profile, settings, onSettings, onClose }: { profile: ChefProfile; settings: ResumeExportSettings; onSettings: (settings: ResumeExportSettings) => void; onClose: () => void }) {
  const labels: Record<keyof ResumeExportSettings, string> = { includeProfilePhoto: 'Include profile photo', includeEmail: 'Include email', includePhone: 'Include phone', includeLocation: 'Include location', includeCertificates: 'Include certificates', includeAwards: 'Include awards', includePortfolioLink: 'Include portfolio link', includeMiseChefProfileLink: 'Include MiseChef profile link' };
  const [exportState, setExportState] = useState<'idle' | 'generating' | 'downloaded' | 'error'>('idle');
  const [exportError, setExportError] = useState('');
  const handleExport = async () => {
    setExportState('generating');
    setExportError('');
    try {
      await exportChefProfilePdf(profile, settings);
      setExportState('downloaded');
    } catch {
      setExportState('error');
      setExportError('We could not create your PDF. Please try again.');
    }
  };

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="resume-settings-title" className="w-full max-w-lg rounded-3xl bg-background p-6 shadow-xl"><div className="flex items-center justify-between"><h2 id="resume-settings-title" className="font-display text-2xl font-bold text-primary">Resume Settings</h2><button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as (keyof ResumeExportSettings)[]).map(key => <label key={key} className="flex items-center gap-2 font-sans text-sm font-bold text-primary"><input type="checkbox" checked={settings[key]} onChange={event => onSettings({ ...settings, [key]: event.target.checked })} />{labels[key]}</label>)}</div><p className="mt-4 font-sans text-xs font-bold text-on-surface-variant">A clean A4 PDF with selectable text will download directly to your device.</p>{exportState === 'downloaded' && <p role="status" className="mt-3 font-sans text-xs font-extrabold text-secondary">Resume downloaded.</p>}{exportError && <p role="alert" className="mt-3 font-sans text-xs font-extrabold text-error">{exportError}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-full px-5 py-3 font-sans text-xs font-extrabold text-on-surface-variant">{exportState === 'downloaded' ? 'Close' : 'Cancel'}</button><button type="button" disabled={exportState === 'generating'} onClick={handleExport} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50"><FileText className="h-4 w-4" />{exportState === 'generating' ? 'Creating PDF...' : 'Export PDF'}</button></div></div></div>;
}
