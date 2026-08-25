import { httpsCallable } from 'firebase/functions';
import type { User } from 'firebase/auth';
import { functions } from '../firebase';
import { selectClientProvisioningDisplayName } from './newUserProvisioningModel';

export interface NewUserProvisioningResult {
  ready: true;
  workspaceId: string;
  displayName: string;
  workspaceName: string;
  role: 'Owner';
  userRole: 'super_admin' | 'admin' | 'user';
  subscriptionPlan: 'free' | 'starter' | 'professional' | 'business' | 'internal_unlimited';
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'suspended';
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

const pendingRegistrationNames = new Map<string, string>();
const provisioningRequests = new Map<string, Promise<NewUserProvisioningResult>>();
const normalizeEmail = (email: string | null | undefined) => email?.trim().toLowerCase() || '';

export const rememberPendingRegistrationName = (email: string, displayName: string) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = displayName.trim();
  if (normalizedEmail && normalizedName) pendingRegistrationNames.set(normalizedEmail, normalizedName);
};

export const forgetPendingRegistrationName = (email: string) => {
  pendingRegistrationNames.delete(normalizeEmail(email));
};

export const ensureNewUserProvisioned = (user: User, enteredName?: string): Promise<NewUserProvisioningResult> => {
  const existingRequest = provisioningRequests.get(user.uid);
  if (existingRequest) return existingRequest;
  if (!functions) return Promise.reject(new Error("We couldn't connect to workspace setup. Please try again."));

  const emailKey = normalizeEmail(user.email);
  const displayName = selectClientProvisioningDisplayName({
    enteredName: enteredName || pendingRegistrationNames.get(emailKey),
    authDisplayName: user.displayName,
    email: user.email
  });
  const provision = httpsCallable<{ displayName: string }, NewUserProvisioningResult>(functions, 'provisionNewUserWorkspace');
  const request = provision({ displayName })
    .then(response => {
      pendingRegistrationNames.delete(emailKey);
      return response.data;
    })
    .finally(() => provisioningRequests.delete(user.uid));

  provisioningRequests.set(user.uid, request);
  return request;
};
