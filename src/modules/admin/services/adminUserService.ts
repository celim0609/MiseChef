import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { AdminUserRecord } from '../types';

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const readNestedString = (value: unknown, keys: string[], fallback = '') => {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const nestedValue = readString(record[key]);
    if (nestedValue) return nestedValue;
  }

  return fallback;
};

const resolveSubscriptionPlan = (data: Record<string, unknown>) => {
  return readString(data.subscriptionPlan)
    || readString(data.plan)
    || readNestedString(data.subscription, ['plan', 'name', 'tier'])
    || 'Free';
};

const resolveLastLogin = (data: Record<string, unknown>) => {
  return readString(data.lastLoginAt)
    || readString(data.lastLogin)
    || readString(data.lastSignInTime)
    || readNestedString(data.metadata, ['lastSignInTime'])
    || '';
};

const resolveCompany = (
  data: Record<string, unknown>,
  companyById: Map<string, string>,
  workspaceByOwnerId: Map<string, string>
) => {
  const companyId = readString(data.companyId);
  return readString(data.company)
    || readString(data.companyName)
    || (companyId ? companyById.get(companyId) : '')
    || readNestedString(data.profile, ['company', 'companyName'])
    || workspaceByOwnerId.get(readString(data.uid))
    || 'Not set';
};

export const adminUserService = {
  async listUsers(): Promise<AdminUserRecord[]> {
    if (!db) return [];

    const [usersSnapshot, companiesSnapshot, workspacesSnapshot] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'companies')).catch(() => null),
      getDocs(collection(db, 'workspaces')).catch(() => null)
    ]);

    const companyById = new Map<string, string>();
    companiesSnapshot?.docs.forEach(companyDoc => {
      const company = companyDoc.data() as Record<string, unknown>;
      companyById.set(companyDoc.id, readString(company.name, 'Company'));
    });

    const workspaceByOwnerId = new Map<string, string>();
    workspacesSnapshot?.docs.forEach(workspaceDoc => {
      const workspace = workspaceDoc.data() as Record<string, unknown>;
      const ownerId = readString(workspace.ownerId);
      const name = readString(workspace.name, 'Workspace');
      if (ownerId) workspaceByOwnerId.set(ownerId, name);
    });

    return usersSnapshot.docs
      .map(userDoc => {
        const data = userDoc.data() as Record<string, unknown>;
        const profile = data.profile && typeof data.profile === 'object' ? data.profile as Record<string, unknown> : {};
        const name = readString(data.displayName)
          || readString(profile.name)
          || readString(data.email).split('@')[0]
          || 'Unnamed User';

        return {
          id: userDoc.id,
          companyId: readString(data.companyId),
          name,
          email: readString(data.email, 'No email'),
          role: readString(data.role, 'user'),
          companyRole: readString(data.companyRole),
          company: resolveCompany({ ...data, uid: userDoc.id }, companyById, workspaceByOwnerId),
          createdAt: readString(data.createdAt),
          lastLoginAt: resolveLastLogin(data),
          subscriptionPlan: resolveSubscriptionPlan(data)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
};
