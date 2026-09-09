import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const TRIAL_DAYS = 14;
const readString = value => typeof value === 'string' ? value.trim() : '';
const toDate = value => value && typeof value.toDate === 'function' ? value.toDate() : null;

export const buildBusinessTrialRecords = ({
  uid,
  email,
  authDisplayName,
  now,
  existingUser = {},
  existingCompany = {},
  existingWorkspace = {},
  workspaceExists = false
}) => {
  const displayName = readString(authDisplayName) || readString(email).split('@')[0] || 'Chef';
  const nowIso = now.toISOString();
  const storedPlan = readString(existingWorkspace.subscriptionPlan);
  const storedStatus = readString(existingWorkspace.subscriptionStatus);
  const storedTrialStart = toDate(existingWorkspace.trialStartedAt);
  const storedTrialEnd = toDate(existingWorkspace.trialEndsAt);

  if (workspaceExists && storedPlan === 'internal_unlimited') {
    throw new HttpsError('failed-precondition', 'This workspace already has an active internal entitlement.');
  }
  if (workspaceExists && storedPlan !== 'free' && (storedStatus === 'active' || storedStatus === 'trialing')) {
    throw new HttpsError('already-exists', 'This workspace already has a Business entitlement.');
  }
  if (storedTrialStart || storedTrialEnd) {
    throw new HttpsError('failed-precondition', 'The Business trial for this account has already been used.');
  }
  if (workspaceExists && readString(existingWorkspace.ownerId) && existingWorkspace.ownerId !== uid) {
    throw new HttpsError('permission-denied', 'Only the workspace owner can start its Business trial.');
  }

  const trialStart = Timestamp.fromDate(now);
  const trialEnd = Timestamp.fromMillis(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const workspaceName = readString(existingWorkspace.name) || `${displayName.split(/\s+/)[0]}'s Workspace`;
  const owner = { userId: uid, email, displayName, role: 'Owner', status: 'Active' };
  const existingMembers = Array.isArray(existingWorkspace.members) ? existingWorkspace.members : [];
  const members = existingMembers.some(member => member?.userId === uid)
    ? existingMembers.map(member => member?.userId === uid ? { ...member, ...owner } : member)
    : [...existingMembers, owner];

  return {
    user: {
      ...existingUser,
      uid,
      companyId: uid,
      companyRole: readString(existingUser.companyRole) || 'owner',
      updatedAt: nowIso
    },
    company: {
      ...existingCompany,
      companyId: uid,
      name: readString(existingCompany.name) || `${displayName}'s Company`,
      ownerId: uid,
      subscriptionPlan: 'professional',
      subscriptionStatus: 'trialing',
      billingCycle: readString(existingCompany.billingCycle) || 'monthly',
      subscriptionStartedAt: readString(existingCompany.subscriptionStartedAt) || nowIso,
      subscriptionRenewalAt: trialEnd.toDate().toISOString(),
      subscriptionCancelledAt: null,
      status: 'Active',
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      createdAt: readString(existingCompany.createdAt) || nowIso,
      updatedAt: nowIso
    },
    workspace: {
      ...existingWorkspace,
      id: uid,
      name: workspaceName,
      ownerId: uid,
      country: readString(existingWorkspace.country) || 'MY',
      members,
      subscriptionPlan: 'professional',
      subscriptionStatus: 'trialing',
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      subscriptionUpdatedAt: FieldValue.serverTimestamp(),
      createdAt: readString(existingWorkspace.createdAt) || nowIso,
      updatedAt: nowIso
    },
    membership: {
      id: `${uid}_${uid}`,
      workspaceId: uid,
      userId: uid,
      email,
      displayName,
      role: 'Owner',
      status: 'Active',
      workspaceName,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    result: {
      workspaceId: uid,
      workspaceName,
      subscriptionPlan: 'professional',
      subscriptionStatus: 'trialing',
      trialStartedAt: trialStart.toDate().toISOString(),
      trialEndsAt: trialEnd.toDate().toISOString()
    }
  };
};

export const startBusinessTrial = async ({ db, uid, email, authDisplayName, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before starting a Business trial.');
  const workspaceRef = db.collection('workspaces').doc(uid);
  const membershipRef = db.collection('workspaceMembers').doc(`${uid}_${uid}`);
  const userRef = db.collection('users').doc(uid);
  const companyRef = db.collection('companies').doc(uid);
  return db.runTransaction(async transaction => {
    const [userSnapshot, companySnapshot, workspaceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(companyRef),
      transaction.get(workspaceRef)
    ]);
    const records = buildBusinessTrialRecords({
      uid,
      email,
      authDisplayName,
      now,
      existingUser: userSnapshot.data() || {},
      existingCompany: companySnapshot.data() || {},
      existingWorkspace: workspaceSnapshot.data() || {},
      workspaceExists: workspaceSnapshot.exists
    });
    transaction.set(userRef, records.user, { merge: true });
    transaction.set(companyRef, records.company, { merge: true });
    transaction.set(workspaceRef, records.workspace, { merge: true });
    transaction.set(membershipRef, records.membership, { merge: true });
    return records.result;
  });
};
