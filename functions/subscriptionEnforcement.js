import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireWorkspaceFeature, SUBSCRIPTION_PLANS, UNLIMITED } from './subscriptionFoundation.js';

const PLAN_LIMITS = Object.freeze(Object.fromEntries(Object.entries(SUBSCRIPTION_PLANS).map(([plan, definition]) => [plan, definition.limits])));
// Internal abuse/cost ceiling, not a subscription-plan promise. Keep this
// isolated from Workspace aiRequests and adjust only with product approval.
export const PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT = 25;

const readString = value => typeof value === 'string' ? value.trim() : '';

const getMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

const readTimestamp = value => {
  if (value?.toDate instanceof Function) return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const isUsageRecordInMonth = (record, monthKey) => {
  const createdAt = readTimestamp(record.createdAt || record.timestamp);
  return createdAt ? createdAt.toISOString().slice(0, 7) === monthKey : false;
};

const getLimitError = (resource, limit) => new HttpsError(
  'resource-exhausted',
  `Your workspace has reached its ${resource} limit (${limit}). Upgrade the workspace plan to continue.`,
  { reason: 'subscription-limit-reached', resource, limit }
);

export const requireWorkspaceEntitlements = async ({ db, uid, workspaceId }) => {
  return requireWorkspaceFeature({ db, uid, workspaceId, feature: 'aiRequests' });
};

const loadMonthlyUsageBaseline = async ({ db, workspaceId, monthKey }) => {
  const snapshot = await db.collection('ai_usage').where('companyId', '==', workspaceId).get();
  return snapshot.docs.reduce((usage, usageDocument) => {
    const record = usageDocument.data() || {};
    if (!isUsageRecordInMonth(record, monthKey)) return usage;
    if (record.status !== 'success') return usage;
    if (record.feature === 'parseResumeToPortfolio') {
      usage.personalResumeImports += 1;
      return usage;
    }
    usage.aiRequests += 1;
    if (record.feature === 'parseInvoiceToJson') usage.invoiceOcr += 1;
    if (record.feature === 'extractPersonalExpenseReceipt') usage.personalExpenseOcr += 1;
    return usage;
  }, { aiRequests: 0, invoiceOcr: 0, personalExpenseOcr: 0, personalResumeImports: 0 });
};

export const reserveMonthlySubscriptionUsage = async ({ db, entitlements, increments }) => {
  const monthKey = getMonthKey();
  const usageReference = db.collection('subscriptionUsage').doc(`${entitlements.workspaceId}_${monthKey}`);
  let baseline = { aiRequests: 0, invoiceOcr: 0, personalExpenseOcr: 0, personalResumeImports: 0 };

  try {
    const existingUsage = await usageReference.get();
    if (!existingUsage.exists) {
      baseline = await loadMonthlyUsageBaseline({
        db,
        workspaceId: entitlements.workspaceId,
        monthKey
      });
    }
  } catch (err) {
    throw new HttpsError('unavailable', 'Workspace usage is temporarily unavailable.', {
      reason: 'subscription-usage-lookup-failed'
    });
  }

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(usageReference);
    const current = snapshot.exists ? snapshot.data() || {} : baseline;
    const next = {
      aiRequests: Number(current.aiRequests || 0) + Number(increments.aiRequests || 0),
      invoiceOcr: Number(current.invoiceOcr || 0) + Number(increments.invoiceOcr || 0),
      personalExpenseOcr: Number(current.personalExpenseOcr || 0) + Number(increments.personalExpenseOcr || 0),
      personalResumeImports: Number(current.personalResumeImports || 0) + Number(increments.personalResumeImports || 0)
    };

    for (const resource of ['aiRequests', 'invoiceOcr', 'personalResumeImports']) {
      if (!Number(increments[resource] || 0)) continue;
      const limit = entitlements.limits[resource];
      if (limit !== UNLIMITED && next[resource] > limit) {
        if (resource === 'personalResumeImports') {
          throw new HttpsError(
            'resource-exhausted',
            'Personal Resume Import is temporarily unavailable because its safety limit was reached. Please try again later.',
            { reason: 'personal-resume-import-limit-reached', resource, limit }
          );
        }
        throw getLimitError(resource, limit);
      }
    }

    transaction.set(usageReference, {
      workspaceId: entitlements.workspaceId,
      monthKey,
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: snapshot.exists ? current.createdAt : FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { usageReference, increments };
};

export const reservePersonalResumeImportUsage = async ({ db, userId }) => (
  reserveMonthlySubscriptionUsage({
    db,
    entitlements: {
      workspaceId: userId,
      limits: { personalResumeImports: PERSONAL_RESUME_IMPORT_MONTHLY_SAFETY_LIMIT }
    },
    increments: { personalResumeImports: 1 }
  })
);

export const releaseMonthlySubscriptionUsage = async ({ db, reservation }) => {
  if (!reservation?.usageReference) return;

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservation.usageReference);
    if (!snapshot.exists) return;
    const current = snapshot.data() || {};
    transaction.update(reservation.usageReference, {
      aiRequests: Math.max(0, Number(current.aiRequests || 0) - Number(reservation.increments.aiRequests || 0)),
      invoiceOcr: Math.max(0, Number(current.invoiceOcr || 0) - Number(reservation.increments.invoiceOcr || 0)),
      personalExpenseOcr: Math.max(0, Number(current.personalExpenseOcr || 0) - Number(reservation.increments.personalExpenseOcr || 0)),
      ...(Object.hasOwn(reservation.increments, 'personalResumeImports') ? {
        personalResumeImports: Math.max(
          0,
          Number(current.personalResumeImports || 0) - Number(reservation.increments.personalResumeImports || 0)
        )
      } : {}),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
};

export const createInvoiceUploadReservation = async ({ db, entitlements, invoice }) => {
  const invoiceReference = db.collection('invoices').doc();
  const quotaLockReference = db.collection('subscriptionQuotaLocks').doc(entitlements.workspaceId);
  const invoicesQuery = db.collection('invoices')
    .where('workspaceId', '==', entitlements.workspaceId)
    .select('workspaceId');

  await db.runTransaction(async transaction => {
    const [quotaLockSnapshot, invoicesSnapshot] = await Promise.all([
      transaction.get(quotaLockReference),
      transaction.get(invoicesQuery)
    ]);
    const limit = entitlements.limits.invoices;
    if (limit !== UNLIMITED && invoicesSnapshot.size >= limit) {
      throw getLimitError('invoices', limit);
    }

    transaction.set(invoiceReference, { ...invoice, id: invoiceReference.id });
    transaction.set(quotaLockReference, {
      workspaceId: entitlements.workspaceId,
      revision: Number(quotaLockSnapshot.data()?.revision || 0) + 1,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  return { ...invoice, id: invoiceReference.id };
};

export const cancelInvoiceUploadReservation = async ({ db, uid, invoiceId }) => {
  const invoiceReference = db.collection('invoices').doc(invoiceId);
  const initialSnapshot = await invoiceReference.get();
  if (!initialSnapshot.exists) return;
  const initialInvoice = initialSnapshot.data() || {};
  const entitlements = await requireWorkspaceFeature({
    db,
    uid,
    workspaceId: initialInvoice.workspaceId,
    feature: 'invoiceOcr'
  });
  if (!['Owner', 'Manager', 'Head Chef', 'Purchasing'].includes(entitlements.role)) {
    throw new HttpsError('permission-denied', 'Your workspace role cannot cancel invoice uploads.');
  }
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(invoiceReference);
    if (!snapshot.exists) return;
    const invoice = snapshot.data() || {};
    if (invoice.createdBy !== uid) {
      throw new HttpsError('permission-denied', 'You can only cancel your own invoice upload.');
    }
    if (readString(invoice.fileUrl)) {
      throw new HttpsError('failed-precondition', 'Completed invoice uploads cannot be cancelled.');
    }
    transaction.delete(invoiceReference);
  });
};

export const subscriptionPlanLimits = PLAN_LIMITS;
