export const buildResumeImportPrompt = resumeText => `Extract the entire resume into the provided chef portfolio JSON schema.

Rules:
- Use only facts in the resume; never guess dates, employers, credentials, awards, or qualifications.
- Extract every distinct job, education, certificate, skill, language, award, project, contact item, and social link.
- Preserve entries separately and preserve dates as written. Preserve education even when its institution is omitted.
- Put projects in projects. Put unsupported sections in unmappedSections with concise original content and a reason.
- Ignore government ID/passport numbers, marital status, religion, salary, and full home addresses.
- Only write shortBio when the resume has enough professional information for an accurate summary.
- Keep professional culinary language for food, hospitality, and chef resumes.
- Use empty strings or arrays only when a field is absent. Keep text concise and editable.
- Return JSON only; do not include markdown, notes, commentary, or confidence scores.

RESUME:
${resumeText}`;
