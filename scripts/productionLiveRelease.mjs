import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  PRODUCTION_DEFAULT_ORIGIN,
  PRODUCTION_ORIGIN,
  PRODUCTION_PROJECT_ID,
  PRODUCTION_SITE_ID,
  extractEntryAsset,
  sha256
} from './productionDeploymentSafety.mjs';

const fetchText = async url => {
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Unable to read Production release state: ${url} returned ${response.status}.`);
  return { text: await response.text(), etag: response.headers.get('etag') || '' };
};

let adcAuth;
const getAdcAuth = () => {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Production verification requires GOOGLE_APPLICATION_CREDENTIALS from the service-account authentication step.');
  }
  if (adcAuth) return adcAuth;
  const globalRoot = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
  const firebaseRequire = createRequire(path.join(globalRoot, 'firebase-tools', 'package.json'));
  const { GoogleAuth } = firebaseRequire('google-auth-library');
  adcAuth = new GoogleAuth({
    projectId: PRODUCTION_PROJECT_ID,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  return adcAuth;
};

export const createProductionGoogleApiReader = request => {
  if (typeof request !== 'function') throw new Error('An authenticated Google API request function is required.');

  const readHostingVersion = async () => {
    const response = await request({
      method: 'GET',
      url: `https://firebasehosting.googleapis.com/v1beta1/sites/${PRODUCTION_SITE_ID}/releases`,
      params: { pageSize: 1 }
    });
    return response.data?.releases?.[0]?.version?.name || '';
  };

  const readProductionFunctions = async () => {
    const functions = [];
    let pageToken = '';
    do {
      const params = { pageSize: 1000 };
      if (pageToken) params.pageToken = pageToken;
      const response = await request({
        method: 'GET',
        url: `https://cloudfunctions.googleapis.com/v2/projects/${PRODUCTION_PROJECT_ID}/locations/-/functions`,
        params
      });
      functions.push(...(response.data?.functions || []));
      pageToken = response.data?.nextPageToken || '';
    } while (pageToken);
    return functions.map(item => ({
      id: (item.name || '').split('/').pop(),
      state: item.state || ''
    }));
  };

  return { readHostingVersion, readProductionFunctions };
};

const productionGoogleApi = createProductionGoogleApiReader(options => getAdcAuth().request(options));
const readHostingVersion = productionGoogleApi.readHostingVersion;
export const readProductionFunctions = productionGoogleApi.readProductionFunctions;

export const readLiveProductionFingerprint = async () => {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [customRoot, defaultRoot, release, hostingVersion] = await Promise.all([
    fetchText(`${PRODUCTION_ORIGIN}/?production-release-check=${nonce}`),
    fetchText(`${PRODUCTION_DEFAULT_ORIGIN}/?production-release-check=${nonce}`),
    fetchText(`${PRODUCTION_ORIGIN}/.well-known/misechef-production-release.json?production-release-check=${nonce}`)
      .catch(() => ({ text: '', etag: '' })),
    readHostingVersion()
  ]);
  let releaseMetadata = null;
  try {
    const parsed = JSON.parse(release.text);
    if (parsed?.kind === 'misechef-production-release') releaseMetadata = parsed;
  } catch {
    releaseMetadata = null;
  }
  const core = {
    customRootAsset: extractEntryAsset(customRoot.text),
    defaultRootAsset: extractEntryAsset(defaultRoot.text),
    hostingVersion,
    releaseCommit: releaseMetadata?.sourceCommit || null,
    releaseSourceTree: releaseMetadata?.sourceTree || null,
    releaseProtectedBaseline: releaseMetadata?.protectedBaseline || null,
    releaseBuildId: releaseMetadata?.buildId || null,
    releaseEntryAsset: releaseMetadata?.entryAsset || null,
    customEtag: customRoot.etag,
    defaultEtag: defaultRoot.etag
  };
  return { ...core, fingerprint: sha256(JSON.stringify(core)) };
};
