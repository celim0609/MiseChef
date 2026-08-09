export const normalizeProvisioningName = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const selectClientProvisioningDisplayName = ({
  enteredName,
  authDisplayName,
  email
}: {
  enteredName?: string | null;
  authDisplayName?: string | null;
  email?: string | null;
}) => normalizeProvisioningName(enteredName)
  || normalizeProvisioningName(authDisplayName)
  || normalizeProvisioningName(email).split('@')[0]
  || 'Chef';

export const shouldShowWorkspaceSetup = ({
  hasUser,
  isGuestMode,
  isAppPath,
  status
}: {
  hasUser: boolean;
  isGuestMode: boolean;
  isAppPath: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
}) => hasUser && !isGuestMode && isAppPath && status !== 'ready';
