import { readString } from '../storePaymentsCore.js';

// Default-deny rollout control. Each Firebase environment opts in explicitly.
export const isCurlecPaymentLinkRolloutEnabled = value => readString(value).toLowerCase() === 'true';
