import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertProductionAuthority, PRODUCTION_PROJECT_ID, PRODUCTION_STORAGE_BUCKET, PRODUCTION_ORIGIN, PRODUCTION_DEFAULT_ORIGIN } from './productionDeploymentSafety.mjs';

export const repairRecipePhotoCors = async ({ bucket, policy, fetchImage = fetch }) => {
  if (bucket.name !== PRODUCTION_STORAGE_BUCKET) throw new Error('Recipe photo CORS requires the verified Production image bucket.');
  if (!isDeepStrictEqual(policy, [{ origin: [PRODUCTION_ORIGIN, PRODUCTION_DEFAULT_ORIGIN], method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'], responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable'], maxAgeSeconds: 3600 }])) throw new Error('Recipe photo CORS differs from the approved policy.');
  const [before] = await bucket.getMetadata();
  if (before.cors?.length && !isDeepStrictEqual(before.cors, policy)) throw new Error('An unexpected existing CORS policy requires review.');
  if (!before.cors?.length) await bucket.setCorsConfiguration(policy);
  const [after] = await bucket.getMetadata();
  if (!isDeepStrictEqual(after.cors, policy)) throw new Error('Production image CORS policy verification failed.');
  const [files] = await bucket.getFiles({ prefix: 'recipes/', maxResults: 20, autoPaginate: false });
  const image = files.find(file => /^image\/(jpeg|png|webp)$/.test(file.metadata?.contentType || '') && file.metadata?.metadata?.firebaseStorageDownloadTokens);
  if (!image) throw new Error('No existing Recipe image is available for Production-origin CORS verification.');
  const token = image.metadata.metadata.firebaseStorageDownloadTokens.split(',')[0];
  const url = new URL(`https://firebasestorage.googleapis.com/v0/b/${PRODUCTION_STORAGE_BUCKET}/o/${encodeURIComponent(image.name)}`);
  url.searchParams.set('alt', 'media'); url.searchParams.set('token', token);
  url.searchParams.set('recipePhotoTransfer', randomUUID());
  for (const origin of policy[0].origin) {
    const response = await fetchImage(url, { headers: { Origin: origin }, cache: 'no-store' });
    const allowed = response.headers.get('access-control-allow-origin');
    await response.body?.cancel();
    if (!response.ok || allowed !== origin) throw new Error(`Recipe image CORS response verification failed for ${origin}.`);
  }
  console.log('Recipe image CORS verified for both approved Production origins.');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--candidate-root');
  if (index < 0) throw new Error('An immutable candidate checkout is required.');
  const candidateRoot = path.resolve(process.argv[index + 1]);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: candidateRoot, encoding: 'utf8' }).trim();
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.FIREBASE_DEPLOY_TARGET !== 'production' || process.env.MISECHEF_PRODUCTION_CI_LOCK_ID !== 'misechef-production-deployment') throw new Error('Recipe photo CORS requires protected Production CI.');
  assertProductionAuthority({ expectedSha: process.env.MISECHEF_PRODUCTION_EXPECTED_SHA, approvedSha: process.env.MISECHEF_PRODUCTION_APPROVED_SHA, protectedBaseline: process.env.MISECHEF_PRODUCTION_PROTECTED_BASELINE, resolvedSha: head, githubRef: process.env.GITHUB_REF, githubEvent: process.env.GITHUB_EVENT_NAME, isAncestor: (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: candidateRoot }).status === 0 });
  const require = createRequire(path.join(candidateRoot, 'functions/package.json'));
  const { initializeApp } = require('firebase-admin/app');
  const { getStorage } = require('firebase-admin/storage');
  const app = initializeApp({ projectId: PRODUCTION_PROJECT_ID, storageBucket: PRODUCTION_STORAGE_BUCKET });
  const policy = JSON.parse(readFileSync(new URL('../config/storage/production-cors.json', import.meta.url), 'utf8'));
  await repairRecipePhotoCors({ bucket: getStorage(app).bucket(PRODUCTION_STORAGE_BUCKET), policy });
}
