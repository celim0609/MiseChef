import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const UNLIMITED = -1;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

// These server-owned limits mirror the existing Subscription Center definitions.
// Entitlements are always selected from the authenticated workspace's company document.
const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ invoices: 10, invoiceOcr: 10, aiRequests: 25 }),
  starter: Object.freeze({ invoices: 75, invoiceOcr: 75, aiRequests: 250 }),
  professional: Object.freeze({ invoices: 500, invoiceOcr: 500, aiRequests: 1_000 }),
  business: Object.freeze({ invoices: 2_500, invoiceOcr: 2_500, aiRequests: 5_000 }),
  enterprise: Object.freeze({ invoices: UNLIMITED, invoiceOcr: UNLIMITED, aiRequests: UNLIMITED })
});

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
  const normalizedWorkspaceId = readString(workspaceId);
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use this feature.');
  if (!normalizedWorkspaceId) {
    throw new HttpsError('invalid-argument', 'Workspace ID is required.');
  }

  const membershipReference = db.collection('workspaceMembers').doc(`${normalizedWorkspaceId}_${uid}`);
  const workspaceReference = db.collection('workspaces').doc(normalizedWorkspaceId);
  const companyReference = db.collection('companies').doc(normalizedWorkspaceId);

  let membershipSnapshot;
  let workspaceSnapshot;
  let companySnapshot;
  try {
    [membershipSnapshot, workspaceSnapshot, companySnapshot] = await Promise.all([
      membershipReference.get(),
      workspaceReference.get(),
      companyReference.get()
    ]);
  } catch (err) {
    throw new HttpsError('unavailable', 'Workspace subscription is temporarily unavailable.', {
      reason: 'subscription-lookup-failed'
    });
  }

  const membership = membershipSnapshot.exists ? membershipSnapshot.data() || {} : {};
  const workspace = workspaceSnapshot.exists ? workspaceSnapshot.data() || {} : {};
  const isActiveMember = membership.userId === uid
    && membership.workspaceId === normalizedWorkspaceId
    && membership.status === 'Active';
  const isWorkspaceOwner = workspaceSnapshot.exists && workspace.ownerId === uid;

  if (!isActiveMember && !isWorkspaceOwner) {
    throw new HttpsError('permission-denied', 'You do not have access to this workspace.', {
      reason: 'workspace-membership-required'
    });
  }

  if (!companySnapshot.exists) {
    throw new HttpsError('unavailable', 'Workspace subscription is temporarily unavailable.', {
      reason: 'subscription-not-found'
    });
  }

  const company = companySnapshot.data() || {};
  const plan = readString(company.subscriptionPlan).toLowerCase();
  const status = readString(company.subscriptionStatus).toLowerCase();
  if (!PLAN_LIMITS[plan] || !status) {
    throw new HttpsError('unavailable', 'Workspace subscription is temporarily unavailable.', {
      reason: 'subscription-invalid'
    });
  }
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    throw new HttpsError('permission-denied', 'The workspace subscription is not active.', {
      reason: 'subscription-inactive',
      status
    });
  }

  return {
    workspaceId: normalizedWorkspaceId,
    role: isWorkspaceOwner ? 'Owner' : readString(membership.role),
    plan,
    status,
    limits: PLAN_LIMITS[plan]
  };
};

const loadMonthlyUsageBaseline = async ({ db, workspaceId, monthKey }) => {
  const snapshot = await db.collection('ai_usage').where('companyId', '==', workspaceId).get();
  return snapshot.docs.reduce((usage, usageDocument) => {
    const record = usageDocument.data() || {};
    if (!isUsageRecordInMonth(record, monthKey)) return usage;
    if (record.status !== 'success') return usage;
    usage.aiRequests += 1;
    if (record.feature === 'parseInvoiceToJson') usage.invoiceOcr += 1;
    return usage;
  }, { aiRequests: 0, invoiceOcr: 0 });
};

export const reserveMonthlySubscriptionUsage = async ({ db, entitlements, increments }) => {
  const monthKey = getMonthKey();
  const usageReference = db.collection('subscriptionUsage').doc(`${entitlements.workspaceId}_${monthKey}`);
  let baseline = { aiRequests: 0, invoiceOcr: 0 };

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
      invoiceOcr: Number(current.invoiceOcr || 0) + Number(increments.invoiceOcr || 0)
    };

    for (const resource of ['aiRequests', 'invoiceOcr']) {
      const limit = entitlements.limits[resource];
      if (limit !== UNLIMITED && next[resource] > limit) {
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

export const releaseMonthlySubscriptionUsage = async ({ db, reservation }) => {
  if (!reservation?.usageReference) return;

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reservation.usageReference);
    if (!snapshot.exists) return;
    const current = snapshot.data() || {};
    transaction.update(reservation.usageReference, {
      aiRequests: Math.max(0, Number(current.aiRequests || 0) - Number(reservation.increments.aiRequests || 0)),
      invoiceOcr: Math.max(0, Number(current.invoiceOcr || 0) - Number(reservation.increments.invoiceOcr || 0)),
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
