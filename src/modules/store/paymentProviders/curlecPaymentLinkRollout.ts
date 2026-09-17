export const isCurlecPaymentLinkRolloutEnabled = () => (
  import.meta.env.VITE_CURLEC_PAYMENT_LINK_ROLLOUT_ENABLED === 'true'
);

export const shouldUseCurlecPaymentLink = ({
  paymentMethodId,
  isMetaInAppBrowser,
  rolloutEnabled
}: {
  paymentMethodId: string;
  isMetaInAppBrowser: boolean;
  rolloutEnabled: boolean;
}) => paymentMethodId === 'curlec' && isMetaInAppBrowser && rolloutEnabled;
