import type { GeminiResumePortfolioDraft } from '../../../services/resumePortfolioModel';
import { slugifyProfile } from '../model';
import type { ImportedChefProfile } from '../types';

const splitDate = (value?: string) => {
  const date = (value || '').trim();
  const match = date.match(/^([A-Za-z]+)?\s*(\d{4})?$/);
  return { month: match?.[1] || '', year: match?.[2] || (date.match(/\d{4}/)?.[0] || '') };
};

export const mapResumeDraftToChefProfile = (parsed: GeminiResumePortfolioDraft): ImportedChefProfile => {
  const basic = parsed.basicProfile || {};
  const contact = parsed.contact || {};
  const summary = basic.shortBio || parsed.about?.body || '';
  const importedAt = Date.now();

  return {
    basicInfo: {
      fullName: basic.fullName || '',
      professionalTitle: basic.professionalTitle || '',
      location: basic.location || contact.location || '',
      phone: contact.phone || '',
      email: contact.email || '',
      summary
    },
    skills: (parsed.skills || []).map(item => item.name || '').filter(Boolean),
    experiences: (parsed.experience || []).map((item, index) => {
      const start = splitDate(item.startDate);
      const end = splitDate(item.endDate);
      return {
        id: `import-experience-${importedAt}-${index}`,
        jobTitle: item.role || '',
        companyName: item.organization || '',
        location: item.location || '',
        startMonth: start.month,
        startYear: start.year,
        endMonth: end.month,
        endYear: end.year,
        currentlyWorking: item.isCurrent === true,
        description: item.description || ''
      };
    }),
    education: (parsed.education || []).map((item, index) => ({
      id: `import-education-${importedAt}-${index}`,
      schoolName: item.schoolName || '',
      qualification: item.qualification || '',
      fieldOfStudy: item.fieldOfStudy || '',
      startYear: item.startYear || '',
      endYear: item.endYear || '',
      description: item.description || ''
    })),
    certificates: (parsed.certificates || []).map((item, index) => ({
      id: `import-certificate-${importedAt}-${index}`,
      name: item.title || '',
      issuingOrganisation: item.issuer || '',
      issueDate: item.issueDate || '',
      expiryDate: item.expiryDate || '',
      credentialUrl: item.credentialUrl || ''
    })),
    awards: (parsed.awards || []).map((item, index) => ({
      id: `import-award-${importedAt}-${index}`,
      name: item.name || '',
      issuingOrganisation: item.issuingOrganisation || '',
      year: item.year || '',
      description: item.description || ''
    })),
    languages: (parsed.languages || []).map((item, index) => ({
      id: `import-language-${importedAt}-${index}`,
      language: item.language || '',
      proficiency: item.proficiency || ''
    })),
    socialLinks: parsed.socialLinks || {},
    portfolio: (parsed.projects || []).map((item, index) => ({
      id: `import-project-${importedAt}-${index}`,
      title: item.title || item.role || '',
      description: [
        item.role,
        [item.startDate, item.endDate].filter(Boolean).join(' - '),
        item.description
      ].filter(Boolean).join('\n'),
      projectUrl: item.url || ''
    })),
    profileSlug: slugifyProfile(''),
    summaryGeneratedByAi: Boolean(summary),
    unmappedSections: (parsed.unmappedSections || []).map(section => ({
      sectionName: section.sectionName || 'Unknown section',
      content: section.content || '',
      reason: section.reason || 'No supported Chef Profile field'
    }))
  };
};
