/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from '../types';

type AuthLikeUser = {
  email?: string | null;
};

const DEFAULT_ADMIN_EMAILS = ['celim0609@gmail.com'];

const getConfiguredAdminEmails = () => {
  const configuredEmails = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_ADMIN_EMAILS, ...configuredEmails]);
};

export const normalizeUserRole = (role: unknown): UserRole => {
  return role === 'admin' ? 'admin' : 'user';
};

export const getConfiguredRoleForUser = (user: AuthLikeUser): UserRole => {
  const email = user.email?.trim().toLowerCase();
  if (email && getConfiguredAdminEmails().has(email)) return 'admin';
  return 'user';
};

export const resolveUserRole = (user: AuthLikeUser, storedRole?: unknown): UserRole => {
  const configuredRole = getConfiguredRoleForUser(user);
  if (configuredRole === 'admin') return 'admin';
  return normalizeUserRole(storedRole);
};

export const isAdminRole = (role: UserRole) => role === 'admin';
