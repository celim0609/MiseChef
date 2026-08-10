import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveWorkspaceSubscription } from './subscriptionFoundation.js';

const readString = value => typeof value === 'string' ? value.trim() : '';

const defaultProfile = displayName => ({
  photo: '',
  name: displayName,
  jobTitle: '',
  yearsExperience: '',
  bio: '',
  quote: ''
});

const memberSummary = ({ uid, email, displayName }) => ({
  userId: uid,
  email,
  displayName,
  role: 'Owner',
  status: 'Active'
});

export const selectProvisioningDisplayName = ({ requestedDisplayName, authDisplayName, email }) => {
  const emailName = readString(email).split('@')[0];
  return readString(requestedDisplayName) || readString(authDisplayName) || emailName || 'Chef';
};

export const getPersonalWorkspaceName = displayName => {
  const firstName = readString(displayName).split(/\s+/)[0] || 'Chef';
  return `${firstName}'s Workspace`;
};

export const buildProvisioningRecords = ({
  uid,
  email,
  displayName,
  now,
  workspaceCreateTime,
  existingUser = {},
  existingCompany = {},
  existingWorkspace = {},
  existingMembership = {},
  userExists = false,
  companyExists = false,
  workspaceExists = false,
  membershipExists = false
}) => {
  const nowIso = now.toISOString();
  const profile = existingUser.profile && typeof existingUser.profile === 'object'
    ? { ...defaultProfile(displayName), ...existingUser.profile }
    : defaultProfile(displayName);

  if (!userExists || !readString(profile.name)) profile.name = displayName;

  const workspaceName = workspaceExists && readString(existingWorkspace.name)
    ? existingWorkspace.name
    : getPersonalWorkspaceName(displayName);
  const owner = memberSummary({ uid, email, displayName });
  const members = Array.isArray(existingWorkspace.members)
    ? existingWorkspace.members.some(member => member?.userId === uid)
      ? existingWorkspace.members.map(member => member?.userId === uid ? { ...member, ...owner } : member)
      : [...existingWorkspace.members, owner]
    : [owner];
  const createdAt = readString(existingWorkspace.createdAt) || nowIso;
  const subscription = resolveWorkspaceSubscription({
    data: existingWorkspace,
    createTime: workspaceCreateTime || createdAt,
    now
  });

  return {
    user: {
      ...existingUser,
      uid,
      companyId: readString(existingUser.companyId) || uid,
      companyRole: readString(existingUser.companyRole) || 'owner',
      email,
      displayName: userExists && readString(existingUser.displayName) ? existingUser.displayName : displayName,
      role: readString(existingUser.role) || 'user',
      profile,
      authProvider: readString(existingUser.authProvider) || 'password',
      ...(!userExists ? {
        onboarding: {
          version: 1,
          status: 'pending',
          goals: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null
        }
      } : {}),
      createdAt: readString(existingUser.createdAt) || nowIso,
      updatedAt: nowIso
    },
    company: {
      ...existingCompany,
      companyId: readString(existingCompany.companyId) || uid,
      name: readString(existingCompany.name) || `${displayName}'s Company`,
      ownerId: readString(existingCompany.ownerId) || uid,
      subscriptionPlan: readString(existingCompany.subscriptionPlan) || 'free',
      subscriptionStatus: readString(existingCompany.subscriptionStatus) || 'active',
      billingCycle: readString(existingCompany.billingCycle) || 'monthly',
      subscriptionStartedAt: readString(existingCompany.subscriptionStartedAt) || nowIso,
      subscriptionRenewalAt: readString(existingCompany.subscriptionRenewalAt),
      subscriptionCancelledAt: existingCompany.subscriptionCancelledAt ?? null,
      status: readString(existingCompany.status) || 'Active',
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
      subscriptionPlan: subscription.subscriptionPlan,
      subscriptionStatus: subscription.subscriptionStatus,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      subscriptionUpdatedAt: FieldValue.serverTimestamp(),
      createdAt,
      updatedAt: nowIso
    },
    membership: {
      ...existingMembership,
      id: `${uid}_${uid}`,
      workspaceId: uid,
      userId: uid,
      email,
      displayName,
      role: 'Owner',
      status: 'Active',
      workspaceName,
      createdAt: membershipExists && readString(existingMembership.createdAt) ? existingMembership.createdAt : nowIso,
      updatedAt: nowIso
    },
    result: {
      workspaceId: uid,
      displayName,
      workspaceName,
      role: 'Owner',
      userRole: readString(existingUser.role) || 'user',
      subscriptionPlan: subscription.subscriptionPlan,
      subscriptionStatus: subscription.subscriptionStatus,
      trialStartedAt: subscription.trialStartedAt?.toDate().toISOString() || null,
      trialEndsAt: subscription.trialEndsAt?.toDate().toISOString() || null,
      ready: true
    }
  };
};

export const provisionNewUser = async ({ db, auth, uid, email, authDisplayName, requestedDisplayName, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to set up your workspace.');

  const displayName = selectProvisioningDisplayName({ requestedDisplayName, authDisplayName, email });
  if (readString(requestedDisplayName) && authDisplayName !== displayName) {
    await auth.updateUser(uid, { displayName });
  }

  const userRef = db.collection('users').doc(uid);
  const companyRef = db.collection('companies').doc(uid);
  const workspaceRef = db.collection('workspaces').doc(uid);
  const membershipRef = db.collection('workspaceMembers').doc(`${uid}_${uid}`);

  return db.runTransaction(async transaction => {
    const [userSnapshot, companySnapshot, workspaceSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(companyRef),
      transaction.get(workspaceRef),
      transaction.get(membershipRef)
    ]);
    const records = buildProvisioningRecords({
      uid,
      email,
      displayName,
      now,
      workspaceCreateTime: workspaceSnapshot.createTime || Timestamp.fromDate(now),
      existingUser: userSnapshot.data() || {},
      existingCompany: companySnapshot.data() || {},
      existingWorkspace: workspaceSnapshot.data() || {},
      existingMembership: membershipSnapshot.data() || {},
      userExists: userSnapshot.exists,
      companyExists: companySnapshot.exists,
      workspaceExists: workspaceSnapshot.exists,
      membershipExists: membershipSnapshot.exists
    });

    transaction.set(userRef, records.user, { merge: true });
    transaction.set(companyRef, records.company, { merge: true });
    transaction.set(workspaceRef, records.workspace, { merge: true });
    transaction.set(membershipRef, records.membership, { merge: true });
    return records.result;
  });
};
