export interface MediaPreviewWindow {
  opener: unknown;
  location: { replace: (url: string) => void };
  close: () => void;
}

export type OpenMediaWindow = (
  url?: string | URL,
  target?: string,
  features?: string
) => MediaPreviewWindow | null;

export const openResolvedMedia = async (
  resolveUrl: () => Promise<string>,
  openWindow: OpenMediaWindow
) => {
  const preview = openWindow('about:blank', '_blank');
  if (preview) preview.opener = null;
  try {
    const url = await resolveUrl();
    if (preview) preview.location.replace(url);
    else openWindow(url, '_blank', 'noopener,noreferrer');
    return url;
  } catch (error) {
    preview?.close();
    throw error;
  }
};
