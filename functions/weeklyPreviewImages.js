import manifest from './weeklyPreviewImages.json' with { type: 'json' };

// Static Hosting assets only. No runtime downloads, decoding, or Storage writes.
export function findWeeklyPreviewImage(sourceUrl, canonicalUrl, slot) {
  try {
    const source = new URL(sourceUrl);
    const page = new URL(canonicalUrl);
    if (source.protocol !== 'https:' || source.host !== 'firebasestorage.googleapis.com'
      || source.username || source.password || source.searchParams.get('alt') !== 'media'
      || page.pathname !== manifest.productPath) return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(source.pathname);
    if (!match) return null;
    const entry = manifest.entries.find(item => item.week === slot
      && item.bucket === decodeURIComponent(match[1]) && item.objectPath === decodeURIComponent(match[2]));
    if (!entry) return null;
    return { image: new URL(entry.assetPath, page.origin).toString(),
      imageType: 'image/jpeg', imageWidth: entry.width, imageHeight: entry.height };
  } catch { return null; }
}
