import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { recordAiUsage } from './aiUsageTracker.js';

initializeApp();

const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';
const DAILY_LIMIT = 30;
const REGION = 'us-central1';
const MAX_INVOICE_OCR_BYTES = 10 * 1024 * 1024;
const ALLOWED_INVOICE_OCR_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const recipeResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    yield: { type: Type.STRING },
    servings: { type: Type.STRING },
    prepTime: { type: Type.STRING },
    cookTime: { type: Type.STRING },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.STRING },
          unit: { type: Type.STRING }
        }
      }
    },
    method: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    notes: { type: Type.STRING }
  }
};

const stepsResponseSchema = {
  type: Type.ARRAY,
  items: { type: Type.STRING }
};

const portfolioResumeResponseSchema = {
  type: Type.OBJECT,
  properties: {
    basicProfile: {
      type: Type.OBJECT,
      properties: {
        professionalTitle: { type: Type.STRING },
        yearsExperience: { type: Type.STRING },
        shortBio: { type: Type.STRING },
        quote: { type: Type.STRING },
        location: { type: Type.STRING },
        specialties: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    },
    about: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        body: { type: Type.STRING },
        quote: { type: Type.STRING },
        highlights: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          organization: { type: Type.STRING },
          location: { type: Type.STRING },
          employmentType: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
          isCurrent: { type: Type.BOOLEAN },
          description: { type: Type.STRING },
          achievements: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          level: { type: Type.STRING },
          description: { type: Type.STRING }
        }
      }
    },
    certificates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          issuer: { type: Type.STRING },
          issueDate: { type: Type.STRING },
          expiryDate: { type: Type.STRING },
          credentialId: { type: Type.STRING },
          credentialUrl: { type: Type.STRING },
          description: { type: Type.STRING },
          skillsCertified: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    },
    contact: {
      type: Type.OBJECT,
      properties: {
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
        message: { type: Type.STRING }
      }
    }
  }
};

const invoiceOcrResponseSchema = {
  type: Type.OBJECT,
  properties: {
    supplier: { type: Type.STRING },
    invoiceNumber: { type: Type.STRING },
    invoiceDate: { type: Type.STRING },
    currency: { type: Type.STRING },
    subtotal: { type: Type.NUMBER },
    gst: { type: Type.NUMBER },
    total: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          unitPrice: { type: Type.NUMBER },
          total: { type: Type.NUMBER }
        }
      }
    }
  }
};

const getRequesterId = request => request.auth?.uid || `anon_${request.rawRequest.ip || 'unknown'}`;

const resolveCompanyId = async ({ request, requesterId }) => {
  const dataCompanyId = readString(request.data?.companyId || request.data?.workspaceId);
  if (dataCompanyId) return dataCompanyId;
  if (!request.auth?.uid || requesterId.startsWith('anon_')) return requesterId;

  try {
    const userSnapshot = await db.collection('users').doc(request.auth.uid).get();
    const user = userSnapshot.exists ? userSnapshot.data() || {} : {};
    return readString(user.companyId || user.workspaceId || user.currentWorkspaceId) || request.auth.uid;
  } catch (err) {
    logger.warn('Unable to resolve AI usage company id', { requesterId, ...getErrorDiagnostics(err) });
    return request.auth.uid;
  }
};

const requireAuthenticatedUser = request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use AI invoice OCR.');
  }
  return uid;
};

const getDateKey = () => new Date().toISOString().slice(0, 10);

const readString = value => (typeof value === 'string' ? value.trim() : '');

const readNumber = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isFirebaseStorageUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'firebasestorage.googleapis.com' ||
      url.hostname.endsWith('.firebasestorage.app') ||
      url.hostname.endsWith('.appspot.com') ||
      url.hostname === 'storage.googleapis.com'
    );
  } catch (err) {
    return false;
  }
};

const getInvoiceMimeType = (invoice, contentType) => {
  const cleanContentType = readString(contentType).split(';')[0].trim().toLowerCase();
  if (ALLOWED_INVOICE_OCR_MIME_TYPES.has(cleanContentType)) return cleanContentType;

  const fileName = readString(invoice.fileName).toLowerCase();
  if (fileName.endsWith('.pdf')) return 'application/pdf';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.webp')) return 'image/webp';
  return cleanContentType || 'application/octet-stream';
};

const stripJsonCodeFence = value => readString(value)
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/```$/i, '')
  .trim();

const parseJsonResponse = (text, fallback, includeDiagnostics = false) => {
  try {
    return JSON.parse(stripJsonCodeFence(text || JSON.stringify(fallback)));
  } catch (err) {
    throw new HttpsError('internal', 'AI returned invalid JSON.', {
      reason: 'invalid-json',
      rawTextPreview: includeDiagnostics ? String(text || '').slice(0, 1000) : undefined
    });
  }
};

const sanitizeScannedRecipe = value => {
  const source = value && typeof value === 'object' ? value : {};
  const ingredients = Array.isArray(source.ingredients) ? source.ingredients : [];
  const method = Array.isArray(source.method) ? source.method : [];

  return {
    title: readString(source.title),
    description: readString(source.description),
    yield: readString(source.yield),
    servings: readString(source.servings),
    prepTime: readString(source.prepTime),
    cookTime: readString(source.cookTime),
    ingredients: ingredients
      .map(item => {
        const ingredient = item && typeof item === 'object' ? item : {};
        return {
          name: readString(ingredient.name),
          quantity: readString(ingredient.quantity),
          unit: readString(ingredient.unit)
        };
      })
      .filter(item => item.name || item.quantity || item.unit),
    method: method.map(step => readString(step)).filter(Boolean),
    notes: readString(source.notes)
  };
};

const sanitizeSteps = value => {
  const steps = Array.isArray(value) ? value : value?.steps;
  if (!Array.isArray(steps)) {
    throw new HttpsError('internal', 'AI response did not contain method steps.');
  }

  return steps.map(step => readString(step)).filter(Boolean);
};

const readStringArray = value => Array.isArray(value)
  ? value.map(item => readString(item)).filter(Boolean)
  : [];

const sanitizeResumePortfolio = value => {
  const source = value && typeof value === 'object' ? value : {};
  const basicProfile = source.basicProfile && typeof source.basicProfile === 'object' ? source.basicProfile : {};
  const about = source.about && typeof source.about === 'object' ? source.about : {};
  const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  const experience = Array.isArray(source.experience) ? source.experience : [];
  const skills = Array.isArray(source.skills) ? source.skills : [];
  const certificates = Array.isArray(source.certificates) ? source.certificates : [];

  return {
    basicProfile: {
      professionalTitle: readString(basicProfile.professionalTitle),
      yearsExperience: readString(basicProfile.yearsExperience),
      shortBio: readString(basicProfile.shortBio),
      quote: readString(basicProfile.quote),
      location: readString(basicProfile.location),
      specialties: readStringArray(basicProfile.specialties)
    },
    about: {
      title: readString(about.title),
      body: readString(about.body),
      quote: readString(about.quote),
      highlights: readStringArray(about.highlights)
    },
    experience: experience.map(item => {
      const exp = item && typeof item === 'object' ? item : {};
      return {
        role: readString(exp.role),
        organization: readString(exp.organization),
        location: readString(exp.location),
        employmentType: readString(exp.employmentType),
        startDate: readString(exp.startDate),
        endDate: readString(exp.endDate),
        isCurrent: exp.isCurrent === true,
        description: readString(exp.description),
        achievements: readStringArray(exp.achievements)
      };
    }).filter(item => item.role || item.organization || item.description),
    skills: skills.map(item => {
      const skill = item && typeof item === 'object' ? item : {};
      return {
        name: readString(skill.name),
        category: readString(skill.category),
        level: readString(skill.level),
        description: readString(skill.description)
      };
    }).filter(item => item.name),
    certificates: certificates.map(item => {
      const certificate = item && typeof item === 'object' ? item : {};
      return {
        title: readString(certificate.title),
        issuer: readString(certificate.issuer),
        issueDate: readString(certificate.issueDate),
        expiryDate: readString(certificate.expiryDate),
        credentialId: readString(certificate.credentialId),
        credentialUrl: readString(certificate.credentialUrl),
        description: readString(certificate.description),
        skillsCertified: readStringArray(certificate.skillsCertified)
      };
    }).filter(item => item.title),
    contact: {
      email: readString(contact.email),
      phone: readString(contact.phone),
      location: readString(contact.location),
      message: readString(contact.message)
    }
  };
};

const sanitizeInvoiceOcr = value => {
  const source = value && typeof value === 'object' ? value : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    supplier: readString(source.supplier),
    invoiceNumber: readString(source.invoiceNumber),
    invoiceDate: readString(source.invoiceDate),
    currency: readString(source.currency),
    subtotal: readNumber(source.subtotal),
    gst: readNumber(source.gst),
    total: readNumber(source.total),
    items: items.map(item => {
      const invoiceItem = item && typeof item === 'object' ? item : {};
      return {
        name: readString(invoiceItem.name),
        quantity: readNumber(invoiceItem.quantity),
        unit: readString(invoiceItem.unit),
        unitPrice: readNumber(invoiceItem.unitPrice),
        total: readNumber(invoiceItem.total)
      };
    }).filter(item => item.name || item.quantity || item.unit || item.unitPrice || item.total)
  };
};

const enforceDailyLimit = async ({ requesterId, action }) => {
  const dateKey = getDateKey();
  const usageRef = db.collection('aiUsage').doc(`${dateKey}_${requesterId}_${action}`);

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(usageRef);
    const count = snapshot.exists ? Number(snapshot.data().count || 0) : 0;

    if (count >= DAILY_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Daily AI request limit reached. Please try again tomorrow.');
    }

    transaction.set(usageRef, {
      requesterId,
      action,
      dateKey,
      count: count + 1,
      limit: DAILY_LIMIT,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: snapshot.exists ? snapshot.data().createdAt : FieldValue.serverTimestamp()
    }, { merge: true });
  });
};

const logRequest = async ({ requesterId, companyId, action, status, attempts, errorCode, response, responseTime }) => {
  const legacyLog = db.collection('aiRequestLogs').add({
    requesterId,
    action,
    status,
    attempts,
    errorCode: errorCode || '',
    model: MODEL,
    createdAt: FieldValue.serverTimestamp()
  });

  const usageLog = recordAiUsage({
    db,
    userId: requesterId,
    companyId,
    feature: action,
    provider: 'gemini',
    model: MODEL,
    response,
    responseTime,
    status
  });

  await Promise.all([
    legacyLog.catch(err => logger.warn('AI request legacy log failed', { requesterId, action, ...getErrorDiagnostics(err) })),
    usageLog.catch(err => logger.warn('AI usage tracking failed', { requesterId, action, ...getErrorDiagnostics(err) }))
  ]);
};

const shouldRetry = err => {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('503') || message.includes('500') || message.includes('timeout') || message.includes('unavailable');
};

const callGeminiWithRetry = async generate => {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await generate();
      return { response, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt === 2 || !shouldRetry(err)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw lastError;
};

const getAi = () => new GoogleGenAI({ apiKey: geminiApiKey.value() });

const getErrorDiagnostics = err => ({
  name: err?.name || '',
  message: err?.message || '',
  code: err?.code || '',
  status: err?.status || ''
});

const wrapInternalError = (friendlyMessage, err, includeDiagnostics = false) => new HttpsError('internal', friendlyMessage, {
  reason: 'backend-error',
  diagnostics: includeDiagnostics ? getErrorDiagnostics(err) : undefined
});

export const scanRecipeImage = onCall({
  region: REGION,
  invoker: 'public',
  secrets: [geminiApiKey],
  timeoutSeconds: 120,
  memory: '512MiB'
}, async request => {
  const requesterId = getRequesterId(request);
  const action = 'scanRecipeImage';
  const includeDiagnostics = request.data?.debug === true;
  const startedAt = Date.now();
  let companyId = requesterId;
  let attempts = 0;

  try {
    companyId = await resolveCompanyId({ request, requesterId });
    await enforceDailyLimit({ requesterId, action });

    const imageBase64 = readString(request.data?.imageBase64);
    const mimeType = readString(request.data?.mimeType) || 'image/jpeg';

    if (!imageBase64 || imageBase64.length > 8_000_000) {
      throw new HttpsError('invalid-argument', 'A valid compressed recipe image is required.');
    }

    if (!mimeType.startsWith('image/')) {
      throw new HttpsError('invalid-argument', 'Only image uploads are supported.');
    }

    logger.info('AI recipe scan requested', { requesterId, action, mimeType, imageBytesApprox: Math.round(imageBase64.length * 0.75) });
    const ai = getAi();
    logger.info('Calling Gemini for recipe scan', { requesterId, action, model: MODEL });
    const { response, attempts: usedAttempts } = await callGeminiWithRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          inlineData: {
            mimeType,
            data: imageBase64
          }
        },
        {
          text: [
            'Understand one recipe from this image and return a structured professional recipe.',
            'The source recipe may be written in any language.',
            'Return all structured recipe data in professional culinary English, not literal translation.',
            'Standardize recipe title, description, ingredient names, appropriate units, method steps, and notes into natural chef-facing English.',
            'Use accepted culinary terms, for example: 白萝卜 = Daikon Radish, 生粉 = Cornstarch, 粘米粉 = Rice Flour, 麻油 = Sesame Oil, 蚝油 = Oyster Sauce, 鸡粉 = Chicken Powder.',
            'Return ONLY valid JSON with this exact shape:',
            '{"title":"","description":"","yield":"","servings":"","prepTime":"","cookTime":"","ingredients":[{"name":"","quantity":"","unit":""}],"method":[],"notes":""}',
            'Preserve quantities exactly when readable.',
            'Convert ingredient units only when it is a standard culinary normalization that does not change meaning; otherwise preserve the written unit.',
            'Do not transliterate ingredient names when a professional English culinary term exists.',
            'If handwriting or text is unclear, never invent ingredients, quantities, times, or method details.',
            'If a value is partially readable but uncertain, mark it with "[uncertain]" and include only the readable part.',
            'If a field cannot be recognized at all, leave it blank.',
            'Do not guess, infer, add nutrition, add cost, or invent missing recipe details.'
          ].join(' ')
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: recipeResponseSchema
      }
    }));
    attempts = usedAttempts;
    logger.info('Gemini recipe scan response received', { requesterId, action, attempts, hasText: Boolean(response.text) });

    const parsed = parseJsonResponse(response.text, {}, includeDiagnostics);
    const recipe = sanitizeScannedRecipe(parsed);
    logger.info('AI recipe scan parsed', {
      requesterId,
      action,
      titlePresent: Boolean(recipe.title),
      ingredientCount: recipe.ingredients.length,
      methodStepCount: recipe.method.length
    });
    await logRequest({ requesterId, companyId, action, status: 'success', attempts, response, responseTime: Date.now() - startedAt });
    return { recipe };
  } catch (err) {
    attempts = attempts || 1;
    const errorCode = err instanceof HttpsError ? err.code : 'internal';
    logger.error('AI recipe scan failed', { requesterId, action, attempts, errorCode, ...getErrorDiagnostics(err) });
    await logRequest({ requesterId, companyId, action, status: 'failed', attempts, errorCode, responseTime: Date.now() - startedAt }).catch(() => undefined);

    if (err instanceof HttpsError) throw err;
    throw wrapInternalError('AI recipe scan failed. Please try again.', err, includeDiagnostics);
  }
});

export const parseInvoiceToJson = onCall({
  region: REGION,
  invoker: 'public',
  secrets: [geminiApiKey],
  timeoutSeconds: 120,
  memory: '512MiB'
}, async request => {
  const requesterId = requireAuthenticatedUser(request);
  const action = 'parseInvoiceToJson';
  const includeDiagnostics = request.data?.debug === true;
  const startedAt = Date.now();
  let companyId = requesterId;
  let attempts = 0;

  try {
    companyId = await resolveCompanyId({ request, requesterId });
    await enforceDailyLimit({ requesterId, action });

    const invoiceId = readString(request.data?.invoiceId);
    if (!invoiceId) {
      throw new HttpsError('invalid-argument', 'Invoice ID is required.');
    }

    const invoiceSnapshot = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceSnapshot.exists) {
      throw new HttpsError('not-found', 'Invoice not found.');
    }

    const invoiceRecord = invoiceSnapshot.data() || {};
    if (invoiceRecord.createdBy !== requesterId) {
      throw new HttpsError('permission-denied', 'You can only process your own invoices.');
    }

    const fileUrl = readString(invoiceRecord.fileUrl);
    if (!fileUrl || !isFirebaseStorageUrl(fileUrl)) {
      throw new HttpsError('failed-precondition', 'Invoice file is not available for OCR.');
    }

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new HttpsError('failed-precondition', 'Unable to read the invoice file for OCR.');
    }

    const mimeType = getInvoiceMimeType(invoiceRecord, fileResponse.headers.get('content-type'));
    if (!ALLOWED_INVOICE_OCR_MIME_TYPES.has(mimeType)) {
      throw new HttpsError('invalid-argument', 'AI invoice OCR currently supports PDF, JPG, PNG, and WEBP invoices.');
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    if (!fileBuffer.length || fileBuffer.length > MAX_INVOICE_OCR_BYTES) {
      throw new HttpsError('invalid-argument', 'Invoice file must be 10 MB or smaller.');
    }

    logger.info('AI invoice OCR requested', { requesterId, action, invoiceId, mimeType, fileBytes: fileBuffer.length });
    const ai = getAi();
    const { response, attempts: usedAttempts } = await callGeminiWithRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          inlineData: {
            mimeType,
            data: fileBuffer.toString('base64')
          }
        },
        {
          text: [
            'Extract structured data from this supplier invoice for chef costing review.',
            'Return ONLY valid JSON with this exact shape:',
            '{"supplier":"","invoiceNumber":"","invoiceDate":"","currency":"","subtotal":0,"gst":0,"total":0,"items":[{"name":"","quantity":0,"unit":"","unitPrice":0,"total":0}]}',
            'Rules:',
            '- Do not invent values that are not visible in the invoice.',
            '- Keep item names as written on the invoice, cleaned only for obvious OCR spacing issues.',
            '- Use numbers only for quantity, unitPrice, subtotal, gst, and total.',
            '- Use the invoice currency code or visible symbol text when clear.',
            '- If a field is missing or unreadable, return an empty string or 0.',
            '- Do not create ingredients, match recipes, calculate costs, add notes, markdown, or commentary.'
          ].join(' ')
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: invoiceOcrResponseSchema
      }
    }));
    attempts = usedAttempts;

    const invoice = sanitizeInvoiceOcr(parseJsonResponse(response.text, {}, includeDiagnostics));
    logger.info('AI invoice OCR parsed', { requesterId, action, attempts, supplierPresent: Boolean(invoice.supplier), itemCount: invoice.items.length });
    await logRequest({ requesterId, companyId, action, status: 'success', attempts, response, responseTime: Date.now() - startedAt });
    return { invoice };
  } catch (err) {
    attempts = attempts || 1;
    const errorCode = err instanceof HttpsError ? err.code : 'internal';
    logger.error('AI invoice OCR failed', { requesterId, action, attempts, errorCode, ...getErrorDiagnostics(err) });
    await logRequest({ requesterId, companyId, action, status: 'failed', attempts, errorCode, responseTime: Date.now() - startedAt }).catch(() => undefined);

    if (err instanceof HttpsError) throw err;
    throw wrapInternalError('AI invoice OCR failed. Please try again.', err, includeDiagnostics);
  }
});

export const generateRecipeSteps = onCall({
  region: REGION,
  invoker: 'public',
  secrets: [geminiApiKey],
  timeoutSeconds: 60,
  memory: '256MiB'
}, async request => {
  const requesterId = getRequesterId(request);
  const action = 'generateRecipeSteps';
  const includeDiagnostics = request.data?.debug === true;
  const startedAt = Date.now();
  let companyId = requesterId;
  let attempts = 0;

  try {
    companyId = await resolveCompanyId({ request, requesterId });
    await enforceDailyLimit({ requesterId, action });

    const title = readString(request.data?.title);
    const category = readString(request.data?.category);
    const recipeYield = readString(request.data?.yield);
    const ingredients = Array.isArray(request.data?.ingredients) ? request.data.ingredients : [];

    if (!title || ingredients.length === 0) {
      throw new HttpsError('invalid-argument', 'Recipe title and ingredients are required.');
    }

    const ingredientLines = ingredients
      .map(item => {
        const ingredient = item && typeof item === 'object' ? item : {};
        return `- ${[readString(ingredient.qty), readString(ingredient.unit), readString(ingredient.name)].filter(Boolean).join(' ')}`;
      })
      .filter(line => line !== '-')
      .join('\n');

    const prompt = `
Draft cooking method steps only for this recipe.

Recipe title: ${title}
Category: ${category || 'Not specified'}
Yield: ${recipeYield || 'Not specified'}
Ingredients:
${ingredientLines}

Rules:
- Return only a JSON array of strings.
- Generate method steps only.
- Write every step in professional culinary English.
- Do not perform literal translation; use natural chef-facing cooking terminology.
- Do not generate nutrition.
- Do not generate cost.
- Do not generate new recipe ideas.
- If the supplied title or ingredients contain uncertain values, preserve that uncertainty instead of inventing missing details.
- Keep steps practical, concise, and editable.
`;

    logger.info('AI method draft requested', { requesterId, action, ingredientCount: ingredients.length });
    const ai = getAi();
    const { response, attempts: usedAttempts } = await callGeminiWithRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: stepsResponseSchema
      }
    }));
    attempts = usedAttempts;

    const steps = sanitizeSteps(parseJsonResponse(response.text, [], includeDiagnostics));
    await logRequest({ requesterId, companyId, action, status: 'success', attempts, response, responseTime: Date.now() - startedAt });
    return { steps };
  } catch (err) {
    attempts = attempts || 1;
    const errorCode = err instanceof HttpsError ? err.code : 'internal';
    logger.error('AI method draft failed', { requesterId, action, attempts, errorCode, ...getErrorDiagnostics(err) });
    await logRequest({ requesterId, companyId, action, status: 'failed', attempts, errorCode, responseTime: Date.now() - startedAt }).catch(() => undefined);

    if (err instanceof HttpsError) throw err;
    throw wrapInternalError('AI method draft failed. Please try again.', err, includeDiagnostics);
  }
});

export const parseResumeToPortfolio = onCall({
  region: REGION,
  invoker: 'public',
  secrets: [geminiApiKey],
  timeoutSeconds: 90,
  memory: '256MiB'
}, async request => {
  const requesterId = getRequesterId(request);
  const action = 'parseResumeToPortfolio';
  const includeDiagnostics = request.data?.debug === true;
  const startedAt = Date.now();
  let companyId = requesterId;
  let attempts = 0;

  try {
    companyId = await resolveCompanyId({ request, requesterId });
    await enforceDailyLimit({ requesterId, action });

    const resumeText = readString(request.data?.resumeText);
    if (!resumeText || resumeText.length < 80) {
      throw new HttpsError('invalid-argument', 'Resume text is too short to import.');
    }
    if (resumeText.length > 50_000) {
      throw new HttpsError('invalid-argument', 'Resume text is too long to import.');
    }

    const prompt = `
Convert this resume into an editable chef portfolio draft.

Return ONLY valid JSON with this exact top-level shape:
{
  "basicProfile": {"professionalTitle":"", "yearsExperience":"", "shortBio":"", "quote":"", "location":"", "specialties":[]},
  "about": {"title":"", "body":"", "quote":"", "highlights":[]},
  "experience": [{"role":"", "organization":"", "location":"", "employmentType":"", "startDate":"", "endDate":"", "isCurrent":false, "description":"", "achievements":[]}],
  "skills": [{"name":"", "category":"", "level":"", "description":""}],
  "certificates": [{"title":"", "issuer":"", "issueDate":"", "expiryDate":"", "credentialId":"", "credentialUrl":"", "description":"", "skillsCertified":[]}],
  "contact": {"email":"", "phone":"", "location":"", "message":""}
}

Rules:
- Do not invent details that are not present in the resume.
- Keep professional culinary language when the resume relates to food, hospitality, or chef work.
- Preserve dates as written.
- Use concise editable text.
- If a field is not present, return an empty string or empty array.
- Do not include markdown, notes, commentary, or confidence scores.

Resume text:
${resumeText}
`;

    logger.info('AI resume import requested', { requesterId, action, textLength: resumeText.length });
    const ai = getAi();
    const { response, attempts: usedAttempts } = await callGeminiWithRetry(() => ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: portfolioResumeResponseSchema
      }
    }));
    attempts = usedAttempts;

    const portfolio = sanitizeResumePortfolio(parseJsonResponse(response.text, {}, includeDiagnostics));
    await logRequest({ requesterId, companyId, action, status: 'success', attempts, response, responseTime: Date.now() - startedAt });
    return { portfolio };
  } catch (err) {
    attempts = attempts || 1;
    const errorCode = err instanceof HttpsError ? err.code : 'internal';
    logger.error('AI resume import failed', { requesterId, action, attempts, errorCode, ...getErrorDiagnostics(err) });
    await logRequest({ requesterId, companyId, action, status: 'failed', attempts, errorCode, responseTime: Date.now() - startedAt }).catch(() => undefined);

    if (err instanceof HttpsError) throw err;
    throw wrapInternalError('AI resume import failed. Please try again.', err, includeDiagnostics);
  }
});
