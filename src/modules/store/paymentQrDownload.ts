const PAYMENT_QR_MIME_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

export const isValidConfiguredPaymentQrUrl = (value: string) => {
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export interface PaymentQrDownloadEnvironment {
  fetch: typeof fetch;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createAnchor: () => Pick<HTMLAnchorElement, 'href' | 'download' | 'click' | 'remove'>;
  schedule: (callback: () => void) => void;
}

const browserEnvironment = (): PaymentQrDownloadEnvironment => ({
  fetch: window.fetch.bind(window),
  createObjectUrl: blob => URL.createObjectURL(blob),
  revokeObjectUrl: url => URL.revokeObjectURL(url),
  createAnchor: () => document.createElement('a'),
  schedule: callback => window.setTimeout(callback, 0)
});

export const downloadConfiguredPaymentQr = async (
  qrCodeUrl: string,
  environment: PaymentQrDownloadEnvironment = browserEnvironment()
) => {
  if (!isValidConfiguredPaymentQrUrl(qrCodeUrl)) throw new Error('No valid payment QR is available to download.');
  const response = await environment.fetch(qrCodeUrl);
  if (!response.ok) throw new Error('The payment QR could not be downloaded.');
  const blob = await response.blob();
  const extension = PAYMENT_QR_MIME_TYPES.get(blob.type.toLowerCase());
  if (!extension) throw new Error('The configured payment QR is not a supported image.');

  const objectUrl = environment.createObjectUrl(blob);
  const anchor = environment.createAnchor();
  anchor.href = objectUrl;
  anchor.download = `misechef-payment-qr.${extension}`;
  anchor.click();
  anchor.remove();
  environment.schedule(() => environment.revokeObjectUrl(objectUrl));
};
