import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const FREE_TRIAL_DAYS = 14;
export const UNLIMITED = -1;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_ORDER = ['free', 'starter', 'professional', 'business'];

export const SUBSCRIPTION_PLANS = Object.freeze({
  free: Object.freeze({
    features: Object.freeze({ recipes: true, ingredients: true, suppliers: true, invoiceOcr: true, aiRequests: true, teamMembers: false, reports: false, export: false, multipleWorkspaces: true, inventory: false }),
    limits: Object.freeze({ recipes: 25, ingredients: UNLIMITED, suppliers: 5, invoices: 10, invoiceOcr: 10, aiRequests: 25, teamMembers: 1, storageMB: 250, workspaces: UNLIMITED })
  }),
  starter: Object.freeze({
    features: Object.freeze({ recipes: true, ingredients: true, suppliers: true, invoiceOcr: true, aiRequests: true, teamMembers: false, reports: false, export: true, multipleWorkspaces: true, inventory: false }),
    limits: Object.freeze({ recipes: 150, ingredients: UNLIMITED, suppliers: 25, invoices: 75, invoiceOcr: 75, aiRequests: 250, teamMembers: 3, storageMB: 1_000, workspaces: UNLIMITED })
  }),
  professional: Object.freeze({
    features: Object.freeze({ recipes: true, ingredients: true, suppliers: true, invoiceOcr: true, aiRequests: true, teamMembers: true, reports: true, export: true, multipleWorkspaces: true, inventory: false }),
    limits: Object.freeze({ recipes: 1_000, ingredients: UNLIMITED, suppliers: 100, invoices: 500, invoiceOcr: 500, aiRequests: 1_000, teamMembers: 10, storageMB: 5_000, workspaces: UNLIMITED })
  }),
  business: Object.freeze({
    features: Object.freeze({ recipes: true, ingredients: true, suppliers: true, invoiceOcr: true, aiRequests: true, teamMembers: true, reports: true, export: true, multipleWorkspaces: true, inventory: true }),
    limits: Object.freeze({ recipes: 5_000, ingredients: UNLIMITED, suppliers: 500, invoices: 2_500, invoiceOcr: 2_500, aiRequests: 5_000, teamMembers: 50, storageMB: 25_000, workspaces: UNLIMITED })
  })
});

const readString = value => typeof value === 'string' ? value.trim() : '';
const readDate = value => {
  if (value?.toDate instanceof Function) return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
};

const normalizePlan = value => {
  const plan = readString(value).toLowerCase();
  if (PLAN_ORDER.includes(plan)) return plan;
  return plan === 'enterprise' ? 'business' : 'free';
};

const normalizeStatus = value => {
  const status = readString(value).toLowerCase();
  return ['active', 'trialing', 'past_due', 'cancelled', 'suspended'].includes(status) ? status : 'active';
};

export const resolveWorkspaceSubscription = ({ data = {}, createTime, now = new Date() }) => {
  // Idempotent provisioning may rerun after Firestore assigns createTime. Keep the
  // first committed trial start so a retry cannot shorten the original 14 days.
  const createdAt = readDate(data.trialStartedAt) || readDate(createTime) || readDate(data.createdAt) || now;
  const canonicalTrialEnd = new Date(createdAt.getTime() + FREE_TRIAL_DAYS * DAY_MS);
  const requestedTrialEnd = readDate(data.trialEndsAt);
  const trialEnd = requestedTrialEnd && requestedTrialEnd <= canonicalTrialEnd ? requestedTrialEnd : canonicalTrialEnd;
  const hasSubscription = Boolean(readString(data.subscriptionPlan));
  const storedStatus = normalizeStatus(data.subscriptionStatus);
  const isTrial = !hasSubscription || storedStatus === 'trialing';
  const expired = isTrial && now >= trialEnd;
  const plan = expired ? 'free' : !hasSubscription ? 'professional' : normalizePlan(data.subscriptionPlan);
  const status = expired ? 'active' : !hasSubscription ? 'trialing' : storedStatus;

  return {
    subscriptionPlan: plan,
    subscriptionStatus: status,
    trialStartedAt: isTrial ? Timestamp.fromDate(createdAt) : data.trialStartedAt || null,
    trialEndsAt: isTrial ? Timestamp.fromDate(trialEnd) : data.trialEndsAt || null,
    trialDaysRemaining: status === 'trialing' ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY_MS)) : 0,
    features: SUBSCRIPTION_PLANS[plan].features,
    limits: SUBSCRIPTION_PLANS[plan].limits
  };
};

const needsPersistence = (data, subscription) => data.subscriptionPlan !== subscription.subscriptionPlan
  || data.subscriptionStatus !== subscription.subscriptionStatus
  || (subscription.subscriptionStatus === 'trialing'
    && (!readDate(data.trialStartedAt) || !readDate(data.trialEndsAt)));

export const loadWorkspaceSubscription = async ({ db, workspaceSnapshot, now = new Date() }) => {
  if (!workspaceSnapshot?.exists) {
    throw new HttpsError('not-found', 'Workspace not found.');
  }
  const data = workspaceSnapshot.data() || {};
  const subscription = resolveWorkspaceSubscription({ data, createTime: workspaceSnapshot.createTime, now });

  if (needsPersistence(data, subscription)) {
    await workspaceSnapshot.ref.set({
      subscriptionPlan: subscription.subscriptionPlan,
      subscriptionStatus: subscription.subscriptionStatus,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      subscriptionUpdatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return subscription;
};

export const requireWorkspaceAccess = async ({ db, uid, workspaceId }) => {
  const normalizedWorkspaceId = readString(workspaceId);
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use this feature.');
  if (!normalizedWorkspaceId) throw new HttpsError('invalid-argument', 'Workspace ID is required.');

  const [workspaceSnapshot, membershipSnapshot] = await Promise.all([
    db.collection('workspaces').doc(normalizedWorkspaceId).get(),
    db.collection('workspaceMembers').doc(`${normalizedWorkspaceId}_${uid}`).get()
  ]);
  if (!workspaceSnapshot.exists) throw new HttpsError('not-found', 'Workspace not found.');

  const workspace = workspaceSnapshot.data() || {};
  const membership = membershipSnapshot.exists ? membershipSnapshot.data() || {} : {};
  const isOwner = workspace.ownerId === uid;
  const isActiveMember = membership.userId === uid && membership.workspaceId === normalizedWorkspaceId && membership.status === 'Active';
  if (!isOwner && !isActiveMember) throw new HttpsError('permission-denied', 'You do not have access to this workspace.');

  return { workspaceId: normalizedWorkspaceId, workspaceSnapshot, role: isOwner ? 'Owner' : readString(membership.role) };
};

export const requireWorkspaceFeature = async ({ db, uid, workspaceId, feature }) => {
  const access = await requireWorkspaceAccess({ db, uid, workspaceId });
  const subscription = await loadWorkspaceSubscription({ db, workspaceSnapshot: access.workspaceSnapshot });
  if (!Object.prototype.hasOwnProperty.call(subscription.features, feature)) {
    throw new HttpsError('invalid-argument', 'Unknown subscription feature.');
  }
  if (!subscription.features[feature]) {
    const requiredPlan = PLAN_ORDER.find(plan => SUBSCRIPTION_PLANS[plan].features[feature]) || 'business';
    throw new HttpsError('permission-denied', 'Upgrade the workspace plan to use this feature.', {
      reason: 'subscription-feature-unavailable', feature, currentPlan: subscription.subscriptionPlan, requiredPlan
    });
  }
  if (!['active', 'trialing'].includes(subscription.subscriptionStatus)) {
    throw new HttpsError('permission-denied', 'The workspace subscription is not active.', { reason: 'subscription-inactive' });
  }

  return { ...access, plan: subscription.subscriptionPlan, status: subscription.subscriptionStatus, features: subscription.features, limits: subscription.limits };
};

export const subscriptionPlanOrder = PLAN_ORDER;
