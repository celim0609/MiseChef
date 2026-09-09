import { HttpsError } from 'firebase-functions/v2/https';

const readString = value => typeof value === 'string' ? value.trim() : '';

const defaultProfile = displayName => ({
  photo: '',
  name: displayName,
  jobTitle: '',
  yearsExperience: '',
  bio: '',
  quote: ''
});

export const selectProvisioningDisplayName = ({ requestedDisplayName, authDisplayName, email }) => {
  const emailName = readString(email).split('@')[0];
  return readString(requestedDisplayName) || readString(authDisplayName) || emailName || 'Chef';
};

export const buildProvisioningRecords = ({
  uid,
  email,
  displayName,
  now,
  existingUser = {},
  userExists = false
}) => {
  const nowIso = now.toISOString();
  const profile = existingUser.profile && typeof existingUser.profile === 'object'
    ? { ...defaultProfile(displayName), ...existingUser.profile }
    : defaultProfile(displayName);

  if (!userExists || !readString(profile.name)) profile.name = displayName;
  const userRole = readString(existingUser.role) || 'user';

  return {
    user: {
      ...existingUser,
      uid,
      email,
      displayName: userExists && readString(existingUser.displayName) ? existingUser.displayName : displayName,
      role: userRole,
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
    result: { displayName, userRole, ready: true }
  };
};

export const provisionNewUser = async ({ db, auth, uid, email, authDisplayName, requestedDisplayName, now = new Date() }) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to set up your personal account.');

  const displayName = selectProvisioningDisplayName({ requestedDisplayName, authDisplayName, email });
  if (readString(requestedDisplayName) && authDisplayName !== displayName) {
    await auth.updateUser(uid, { displayName });
  }

  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(userRef);
    const records = buildProvisioningRecords({
      uid,
      email,
      displayName,
      now,
      existingUser: userSnapshot.data() || {},
      userExists: userSnapshot.exists
    });
    transaction.set(userRef, records.user, { merge: true });
    return records.result;
  });
};
