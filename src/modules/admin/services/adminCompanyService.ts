import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { normalizeSubscriptionPlan } from '../../../services/subscriptionService';
import type { AdminCompanyMemberRecord, AdminCompanyRecord } from '../types';

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const readTimestamp = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return '';
};

const readProfileName = (data: Record<string, unknown>) => {
  const profile = data.profile && typeof data.profile === 'object' ? data.profile as Record<string, unknown> : {};
  return readString(data.displayName)
    || readString(profile.name)
    || readString(data.email).split('@')[0]
    || 'Unnamed User';
};

const normalizeStatus = (value: unknown, fallback = 'active') => readString(value, fallback).toLowerCase();

const getDocumentCompanyId = (data: Record<string, unknown>) => readString(data.companyId) || readString(data.workspaceId) || readString(data.createdBy) || readString(data.userId);

const increment = (map: Map<string, number>, key: string) => {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
};

const countDistinctSuppliersByCompany = (ingredients: Array<Record<string, unknown>>) => {
  const suppliersByCompany = new Map<string, Set<string>>();

  ingredients.forEach(ingredient => {
    const companyId = getDocumentCompanyId(ingredient);
    const supplierId = readString(ingredient.supplierId);
    if (!companyId || !supplierId) return;

    const current = suppliersByCompany.get(companyId) || new Set<string>();
    current.add(supplierId);
    suppliersByCompany.set(companyId, current);
  });

  return suppliersByCompany;
};

export const adminCompanyService = {
  async listCompanies(): Promise<AdminCompanyRecord[]> {
    if (!db) return [];

    const [companiesSnapshot, usersSnapshot, recipesSnapshot, invoicesSnapshot, ingredientsSnapshot, aiUsageSnapshot] = await Promise.all([
      getDocs(collection(db, 'companies')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'recipes')).catch(() => null),
      getDocs(collection(db, 'invoices')).catch(() => null),
      getDocs(collection(db, 'ingredients')).catch(() => null),
      getDocs(collection(db, 'ai_usage')).catch(() => null)
    ]);

    const usersById = new Map<string, Record<string, unknown>>();
    const membersByCompany = new Map<string, AdminCompanyMemberRecord[]>();

    usersSnapshot.docs.forEach(userDoc => {
      const user = userDoc.data() as Record<string, unknown>;
      const companyId = readString(user.companyId) || userDoc.id;
      usersById.set(userDoc.id, user);

      const member: AdminCompanyMemberRecord = {
        id: userDoc.id,
        name: readProfileName(user),
        role: readString(user.companyRole) || readString(user.role, 'staff'),
        email: readString(user.email, 'No email')
      };

      membersByCompany.set(companyId, [...(membersByCompany.get(companyId) || []), member]);
    });

    const recipeCountByCompany = new Map<string, number>();
    recipesSnapshot?.docs.forEach(recipeDoc => increment(recipeCountByCompany, getDocumentCompanyId(recipeDoc.data() as Record<string, unknown>)));

    const invoiceCountByCompany = new Map<string, number>();
    invoicesSnapshot?.docs.forEach(invoiceDoc => increment(invoiceCountByCompany, getDocumentCompanyId(invoiceDoc.data() as Record<string, unknown>)));

    const ingredientRecords = ingredientsSnapshot?.docs.map(ingredientDoc => ingredientDoc.data() as Record<string, unknown>) || [];
    const suppliersByCompany = countDistinctSuppliersByCompany(ingredientRecords);

    const aiRequestCountByCompany = new Map<string, number>();
    aiUsageSnapshot?.docs.forEach(usageDoc => increment(aiRequestCountByCompany, readString((usageDoc.data() as Record<string, unknown>).companyId)));

    return companiesSnapshot.docs.map(companyDoc => {
      const company = companyDoc.data() as Record<string, unknown>;
      const companyId = readString(company.companyId, companyDoc.id);
      const ownerId = readString(company.ownerId);
      const owner = usersById.get(ownerId) || {};
      const members = (membersByCompany.get(companyId) || []).sort((a, b) => a.name.localeCompare(b.name));

      return {
        companyId,
        name: readString(company.name, 'Unnamed Company'),
        ownerId,
        ownerName: readProfileName(owner),
        ownerEmail: readString(owner.email, 'No email'),
        subscriptionPlan: normalizeSubscriptionPlan(company.subscriptionPlan),
        subscriptionStatus: normalizeStatus(company.subscriptionStatus),
        billingCycle: normalizeStatus(company.billingCycle, 'monthly'),
        subscriptionStartedAt: readTimestamp(company.subscriptionStartedAt) || readString(company.subscriptionStartedAt),
        subscriptionRenewalAt: readTimestamp(company.subscriptionRenewalAt) || readString(company.subscriptionRenewalAt),
        subscriptionCancelledAt: company.subscriptionCancelledAt === null ? null : readTimestamp(company.subscriptionCancelledAt) || readString(company.subscriptionCancelledAt) || null,
        status: readString(company.status, 'Active'),
        createdAt: readTimestamp(company.createdAt) || readString(company.createdAt),
        updatedAt: readTimestamp(company.updatedAt) || readString(company.updatedAt),
        totalMembers: members.length,
        recipeCount: recipeCountByCompany.get(companyId) || 0,
        invoiceCount: invoiceCountByCompany.get(companyId) || 0,
        supplierCount: suppliersByCompany.get(companyId)?.size || 0,
        aiRequestCount: aiRequestCountByCompany.get(companyId) || 0,
        members
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
};
