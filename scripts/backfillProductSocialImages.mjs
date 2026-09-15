import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const BETA_PROJECT_ID = 'misechef-beta-fa4bf';
export const PRODUCT_SOCIAL_IMAGE = { width: 1200, height: 630, targetBytes: 300 * 1024, maxBytes: 600 * 1024 };

export const getStorageObjectPath = (value, bucketName) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    if (value.startsWith(`gs://${bucketName}/`)) return value.slice(bucketName.length + 6);
    const url = new URL(value);
    const firebaseMatch = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (firebaseMatch && firebaseMatch[1] === bucketName) return decodeURIComponent(firebaseMatch[2]);
    const googleMatch = /^\/download\/storage\/v1\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (googleMatch && googleMatch[1] === bucketName) return decodeURIComponent(googleMatch[2]);
  } catch {}
  return '';
};

export const buildPublicStorageUrl = (bucketName, objectPath, token) => (
  `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`
);

export const isMissingProductSocialImage = product => !(typeof product.socialImageUrl === 'string' && product.socialImageUrl.trim());

export const isSafeExternalImageUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost')
      && !/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^\[?::1\]?$/i.test(url.hostname);
  } catch {
    return false;
  }
};

export const downloadExternalImage = async sourceUrl => {
  let currentUrl = sourceUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isSafeExternalImageUrl(currentUrl)) throw new Error('Product photo URL is not a permitted public HTTPS image.');
    const response = await fetch(currentUrl, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Product photo redirect is missing its destination.');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Product photo is not a publicly readable image.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Product photo is empty or exceeds 10 MB.');
    return bytes;
  }
  throw new Error('Product photo has too many redirects.');
};

export const optimizeProductSocialImage = async source => {
  let quality = 84;
  let output = await sharp(source).rotate().resize(PRODUCT_SOCIAL_IMAGE.width, PRODUCT_SOCIAL_IMAGE.height, {
    fit: 'cover',
    position: 'centre'
  }).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (output.length > PRODUCT_SOCIAL_IMAGE.targetBytes && quality > 45) {
    quality -= 8;
    output = await sharp(source).rotate().resize(PRODUCT_SOCIAL_IMAGE.width, PRODUCT_SOCIAL_IMAGE.height, {
      fit: 'cover',
      position: 'centre'
    }).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  if (output.length > PRODUCT_SOCIAL_IMAGE.maxBytes) {
    throw new Error(`Optimized social image exceeds ${PRODUCT_SOCIAL_IMAGE.maxBytes} bytes.`);
  }
  const metadata = await sharp(output).metadata();
  if (metadata.format !== 'jpeg' || metadata.width !== PRODUCT_SOCIAL_IMAGE.width || metadata.height !== PRODUCT_SOCIAL_IMAGE.height) {
    throw new Error('Optimized social image did not meet the required JPEG dimensions.');
  }
  return output;
};

const assertBetaOnly = () => {
  const requestedProject = process.argv.find(value => value.startsWith('--project='))?.slice('--project='.length);
  if (process.env.FIREBASE_DEPLOY_TARGET !== 'beta' || requestedProject !== BETA_PROJECT_ID || process.env.GCLOUD_PROJECT === 'misechef-fa4bf') {
    throw new Error(`This maintenance script is Beta-only. Set FIREBASE_DEPLOY_TARGET=beta and pass --project=${BETA_PROJECT_ID}.`);
  }
  return requestedProject;
};

const main = async () => {
  const projectId = assertBetaOnly();
  const execute = process.argv.includes('--execute');
  const require = createRequire(import.meta.url);
  const { initializeApp, deleteApp } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/app/index.js`);
  const { getFirestore } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/firestore/index.js`);
  const { getStorage } = require(`${process.cwd()}/functions/node_modules/firebase-admin/lib/storage/index.js`);
  const app = initializeApp({ projectId }, 'product-social-image-backfill');
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`);
  try {
    const snapshot = await db.collection('storeProducts').get();
    const products = snapshot.docs.map(document => ({ id: document.id, ref: document.ref, ...document.data() }));
    const missing = products.filter(isMissingProductSocialImage);
    const candidates = missing.map(product => ({
      ...product,
      sourcePath: getStorageObjectPath(product.photoUrl, bucket.name),
      externalSourceUrl: isSafeExternalImageUrl(product.photoUrl) ? product.photoUrl : '',
      socialPath: `stores/${product.workspaceId}/products/${product.id}/social.jpg`
    }));
    const invalidSources = candidates.filter(product => !product.sourcePath && !product.externalSourceUrl);
    const writable = candidates.filter(product => product.sourcePath || product.externalSourceUrl);
    console.log(JSON.stringify({
      mode: execute ? 'EXECUTE' : 'DRY_RUN', projectId, scanned: products.length,
      missingSocialImageUrl: missing.length, existingSocialImagesSkipped: products.length - missing.length,
      wouldUpdate: writable.length, invalidSourcePhotos: invalidSources.map(product => ({ id: product.id, name: product.name || '' })),
      products: writable.map(product => ({ id: product.id, name: product.name || '', sourcePath: product.sourcePath || product.externalSourceUrl, proposedSocialPath: product.socialPath }))
    }, null, 2));
    if (!execute) return;
    if (invalidSources.length) throw new Error('Refusing to execute while any Product photo is outside the trusted Beta Storage bucket.');
    const updated = [];
    for (const product of writable) {
      const current = await product.ref.get();
      if (!current.exists || !isMissingProductSocialImage(current.data())) continue;
      const source = product.sourcePath
        ? (await bucket.file(product.sourcePath).download())[0]
        : await downloadExternalImage(product.externalSourceUrl);
      const image = await optimizeProductSocialImage(source);
      const token = randomUUID();
      await bucket.file(product.socialPath).save(image, {
        resumable: false,
        metadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } }
      });
      const socialImageUrl = buildPublicStorageUrl(bucket.name, product.socialPath, token);
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(product.ref);
        if (!latest.exists || !isMissingProductSocialImage(latest.data())) return;
        transaction.update(product.ref, { socialImageUrl });
        updated.push({ id: product.id, socialImageUrl });
      });
    }
    for (const result of updated) {
      const verified = await db.collection('storeProducts').doc(result.id).get();
      if (verified.data()?.socialImageUrl !== result.socialImageUrl) throw new Error(`Post-write verification failed for ${result.id}.`);
    }
    console.log(JSON.stringify({ updated: updated.length, verified: updated.length }, null, 2));
  } finally {
    await deleteApp(app);
  }
};

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
