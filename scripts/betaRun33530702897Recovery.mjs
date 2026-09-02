import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { BETA_PROJECT_ID, MANDATORY_BETA_BASELINE } from './betaDeploymentSafety.mjs';

export const BETA_RUN_33530702897_CONFIRMATION = 'RECOVER BETA RUN 33530702897';
export const BETA_RUN_33530702897_AUTHORIZATION =
  'beta-run-33530702897-partial:bba5cc1f166c41a6a92c5fb8275aa37f84acdf42';

const candidateHash = '533abe976f99d0e3d20797cdf94316228b8047a7';
const functionConfigurationHashes = Object.freeze({
  activateMiseChefHost: 'd02b1164ed913c22715a8f2841315d33e4b0cdb729388e7524abd6b96b52e4ac',
  authorizeWorkspaceFeature: '218d74d49a65d618c145e97701ff4d8298496b947285e5095450de3a519f2561',
  cancelInvoiceUpload: 'ea52828a5cf5a4915b5ea408a809ab9fc3d734263f1cf720ff2f4b3a78378c66',
  cancelPublicStorePayment: '6a5ffd29d995a5ce5c2b2f7da7da46d6060797a4d086cc395a2b8134014ce0f1',
  cleanupMyMiseChefGroupOrder: '2df14db495b50f77d95ed65f0a03e14647b7ce550a3fff996890a619fa4605da',
  createInvoiceUpload: '65dae4fdc5ffb4d111631be45f26c9746eb38d1fd4be4c9fbfebe31b6f088e7a',
  createMiseChefGroupOrder: 'be9e44913b0bea64d18c261fdba6c9ee6779dd83ca8a685411c39b96312e65e0',
  createPublicStorePayment: 'c5a3e19f196b571c53e095e2126e1c6f16fe32f9efb02c5662a350cbc9fcca5f',
  expireWorkspaceTrials: 'cac166abc172717b903c7a70f1ac292ce6db9d4ad0f1164861a90f188baf25cf',
  extractPersonalExpenseReceipt: 'e90314772b80b2b195d8de7dae59b2e2cb0201822fe07c327833df70af936864',
  generateRecipeSteps: '7ca9cd2d4215535d55ab05cacec9169717bae9dbdc63d4adaae6681c96882fd9',
  getDashboardAiUsage: '1810d3d6b1848ce0677ae7e5871be8663c5928bdb87f196893a6093873a4f640',
  getMyMiseChefGroupOrder: 'b0926170b87d4814aa7addc8f824958509f0386a0112772ffa546b8509800695',
  getPublicDiscoverContent: '919b31794ce27f8cf614de61794b4df2cd627419dcaed511a0fc6be6bda93d1b',
  getPublicMiseChefGroupOrder: '0b9bb99bbe3ebd32602c3e4beef128b607fdde2a6ed0cf75ac9fbbdaf628bcee',
  getPublicStorePaymentResult: '234ebf7598506c0c1049c4588e749ca49bf54591db4392471586b92a6267e2f6',
  getWorkspaceSubscription: '72244945d6473e65ce50af3d44891b80a8aee0a88f078545c25eb8b134e52277',
  listApprovedProducts: '9f6593d5ff79c9003dc3e113e88f26c67db2ba29a57c731a24013c07f3bfc0e0',
  listMyMiseChefGroupOrders: 'ecf64de8910976ddd5f12f519a87f77331c2528f95b383abd4dca35682cc61b3',
  listMyMiseChefStoreOrders: '54e310ec94e6b005fa376bda916ee334ed11b7846fec12d873c2c662c35ff585',
  parseInvoiceToJson: '873ab73a5cabd7a652adc4b7f6b519f73d53e3f2eea7a11009a73e647c63d22a',
  parseResumeToPortfolio: '2f5e581837404d279130d79d3eed6bd3c9cac8f74a86dc21db3717281b84cc9e',
  processResumeImportJob: 'a6ef511501812f96be60325dd1fd9f205baa2a92a690a2f68de6431037cd1e32',
  provisionNewUserWorkspace: '8f899760a336c22471310b014561017315a341f3183a68c5de7071c1797f0742',
  recordPersonalExpenseSettlement: '51987f6f9ba8e0b16e36c320e3a8942a89e76c2665f46a3dad115853bbf2f59b',
  renderPublicStore: '00aa0d1f2d0e161ffe7b1c6d1f7d4f09f923d28a3af742c29fc89c39217f4734',
  reviewStoreManualPayment: '2f1bcc0d96adac6d4f0e70cd8c5b7b36b6bebe6887e0c11e77eab48471ca94b6',
  scanRecipeImage: '2043e5971e07220ab7b97ebc7b882acb0a456054eda0028e3a3ebf4ecca6dd87',
  startMiseChefBusinessTrial: '90e4f8e76c66ff4d383378378335676b45ea89d3efe1edeb0631dab30b0437d5',
  stripeStorePaymentWebhook: 'a8a20fa38b702a9b14825e7a2e9137d8c4a270fd7532967c49470b0d9dc6bf80',
  submitPublicStoreManualPayment: '97359a4139ba90cd1cdd61d4b0f12584ba604c16508bba12c085185383d18e89',
  syncApprovedProductRecipes: '846de6e37fd1e7b1105c500f69559501ccfb6798b0e921103ab79a8a8c3295aa',
  syncCanonicalChefProfile: '62f562ce497a3a5bb6f3d616314b460f558f52ecc57876ba9e12f8d3934ee1fd',
  syncMiseChefGroupReward: '044fd72ab12aaef25967d903c48fc46ee851e17975e164a44933bd2810f03039',
  syncPublicChefProfile: '9954cdb7252d49de86de090f69a36487a0fb3dfbf5ceb3e9644408cfe327c9d1',
  syncPublicRecipe: '123fb28545a32c428dc233cd533b04d3012c866f7d8c37b7fabc9e70fd01aaf1',
  trackPublicProductClick: '577b9d9116f2630342e466448ac7dd67dcec7b9d037921b870afbb32d5e58077',
  updateMyMiseChefGroupOrderStatus: '0d6298b446590b3394284e474d451912b20d873d1213a83062726934871ce154',
  updateStoreGroupOrderBatchStatus: 'c5d39202151a6886bb8653aa14219e8d3544729086417f42a3d0149be1099f39',
  updateStoreOrderStatus: 'd12ebfefad6e952428a7041d52759e724650dd0a60fe87c3507b647406ea6ed9',
  uploadPublicStorePaymentReceipt: 'f4e9fb98e54118dcb456112d80258764d7d825529c4604404cfb121943de330f'
});

const alternateSourceHashes = Object.freeze({
  cancelPublicStorePayment: '8a600645313abaae512735908a8341206c4a8399',
  createPublicStorePayment: '8a600645313abaae512735908a8341206c4a8399',
  extractPersonalExpenseReceipt: '7ee415247da99ebbc308a90951475de3925915e2',
  generateRecipeSteps: '7ee415247da99ebbc308a90951475de3925915e2',
  getPublicStorePaymentResult: '8a600645313abaae512735908a8341206c4a8399',
  parseInvoiceToJson: '7ee415247da99ebbc308a90951475de3925915e2',
  processResumeImportJob: '7ee415247da99ebbc308a90951475de3925915e2',
  scanRecipeImage: '7ee415247da99ebbc308a90951475de3925915e2',
  stripeStorePaymentWebhook: '496123f73c40f2bebd0208f52c95ca5322b32f67'
});

export const BETA_RUN_33530702897 = Object.freeze({
  id: 'beta-run-33530702897-partial-functions-hosting',
  failedRunId: '33530702897',
  failedRunNumber: 46,
  attemptOneJobId: '99932829000',
  attemptTwoJobId: '99939300333',
  priorCommit: '482d3a3c5902a78dd0f75663f02269747c9b2a53',
  priorSourceTree: '84fb013f48a61c712d4ea7772618bea78526c125',
  candidateCommit: 'bba5cc1f166c41a6a92c5fb8275aa37f84acdf42',
  candidateSourceTree: 'c67015bf5fdb9c928bd88d9662d0fee0b27d09cb',
  rootAsset: '/assets/index-BofM-vHR.js',
  storeAsset: '/assets/index-BGpY59Av.js',
  partialFunctionDigest: 'e818c9ec0f07bd30e43e81262aa8a3a7682310768dc294ff7464ba5de5baa266',
  priorManifest: Object.freeze({
    kind: 'misechef-beta-release',
    version: 1,
    buildId: '1d73af00-aabb-467a-9ac1-2de0ed894474',
    builtAt: '2026-08-31T16:05:58.588Z',
    sourceCommit: '482d3a3c5902a78dd0f75663f02269747c9b2a53',
    sourceTree: '84fb013f48a61c712d4ea7772618bea78526c125',
    protectedBaseline: MANDATORY_BETA_BASELINE,
    entryAsset: '/assets/index-BofM-vHR.js',
    entryAssetSha256: 'c773f3c110d38bc238921f2f2ef6567afd4daa2a79a62f20e22f2cdb37ab1eb9',
    storeShellAsset: '/assets/index-BofM-vHR.js'
  }),
  failedServices: Object.freeze({
    parseResumeToPortfolio: Object.freeze({
      latestCreatedRevision: 'parseresumetoportfolio-00032-mot',
      latestReadyRevision: 'parseresumetoportfolio-00031-pam'
    }),
    reviewStoreManualPayment: Object.freeze({
      latestCreatedRevision: 'reviewstoremanualpayment-00029-sev',
      latestReadyRevision: 'reviewstoremanualpayment-00028-cuq'
    }),
    syncPublicChefProfile: Object.freeze({
      latestCreatedRevision: 'syncpublicchefprofile-00028-wuk',
      latestReadyRevision: 'syncpublicchefprofile-00027-sis'
    })
  })
});

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const functionInventoryDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(`Beta run 33530702897 recovery refused: ${message}`); };

const functionConfiguration = item => ({
  platform: item.platform,
  region: item.region,
  entryPoint: item.entryPoint,
  runtime: item.runtime,
  callableTrigger: item.callableTrigger,
  httpsTrigger: item.httpsTrigger,
  scheduleTrigger: item.scheduleTrigger,
  eventTrigger: item.eventTrigger,
  ingressSettings: item.ingressSettings,
  environmentVariables: item.environmentVariables,
  secretEnvironmentVariables: item.secretEnvironmentVariables,
  timeoutSeconds: item.timeoutSeconds,
  serviceAccount: item.serviceAccount,
  availableMemoryMb: item.availableMemoryMb,
  cpu: item.cpu,
  minInstances: item.minInstances,
  maxInstances: item.maxInstances,
  concurrency: item.concurrency,
  labels: Object.fromEntries(
    Object.entries(item.labels || {}).filter(([key]) => key !== 'firebase-functions-hash')
  )
});

export const normalizeBetaFunctions = functions => [...(functions || [])]
  .map(item => ({
    id: String(item.id || ''),
    generation: String(item.generation || item.source?.storageSource?.generation || ''),
    hash: String(item.hash || ''),
    configurationHash: String(item.configurationHash || digest(functionConfiguration(item))),
    state: String(item.state || '')
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

export const expectedCandidateFunctions = () => Object.entries(functionConfigurationHashes)
  .map(([id, configurationHash]) => ({
    id,
    hash: alternateSourceHashes[id] || candidateHash,
    configurationHash
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

export const resolveBetaRun33530702897RecoveryMode = ({
  confirmation,
  authorization,
  githubActions,
  ciLockId
}) => {
  if (confirmation !== BETA_RUN_33530702897_CONFIRMATION) fail('the incident confirmation is not exact.');
  if (authorization !== BETA_RUN_33530702897_AUTHORIZATION) {
    fail('the protected Beta environment has not supplied the exact incident authorization.');
  }
  if (githubActions !== true || ciLockId !== 'misechef-beta-deployment') {
    fail('recovery is permitted only inside the locked protected Beta workflow.');
  }
  return true;
};

const hasFullReadyTraffic = service => {
  const traffic = service?.trafficStatuses || [];
  return traffic.length > 0
    && traffic.reduce((sum, item) => sum + Number(item.percent || 0), 0) === 100
    && traffic.every(item => (
      Number(item.percent || 0) === 0
      || item.revision === service.latestReadyRevision
      || item.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST'
    ));
};

export const assertBetaRun33530702897PartialState = ({
  head,
  sourceTree,
  liveFingerprint,
  functions,
  services,
  storeAssetProof,
  resolveSourceTree,
  isAncestor
}) => {
  if (head !== BETA_RUN_33530702897.candidateCommit || sourceTree !== BETA_RUN_33530702897.candidateSourceTree) {
    fail('the candidate checkout is not the exact authorized SHA and source tree.');
  }
  if (!same(liveFingerprint?.releaseMetadata, BETA_RUN_33530702897.priorManifest)) {
    fail('the live manifest is not the exact audited prior release.');
  }
  if (
    liveFingerprint?.rootAsset !== BETA_RUN_33530702897.rootAsset
    || liveFingerprint?.storeAsset !== BETA_RUN_33530702897.storeAsset
  ) fail('the root or public Store asset differs from the audited partial release.');
  if (resolveSourceTree(BETA_RUN_33530702897.priorCommit) !== BETA_RUN_33530702897.priorSourceTree) {
    fail('the prior release source tree does not match Git.');
  }
  if (!isAncestor(MANDATORY_BETA_BASELINE, BETA_RUN_33530702897.priorCommit)) {
    fail('the protected baseline is not an ancestor of the prior release.');
  }
  const normalizedFunctions = normalizeBetaFunctions(functions);
  if (functionInventoryDigest(normalizedFunctions) !== BETA_RUN_33530702897.partialFunctionDigest) {
    fail('the exact 41-Function inventory, generation, source, configuration, or state has changed.');
  }
  const expectedIds = expectedCandidateFunctions().map(item => item.id);
  const serviceById = new Map((services || []).map(item => [item.id, item]));
  if (!same([...serviceById.keys()].sort(), expectedIds)) fail('the Cloud Run service inventory is not exactly 41 Functions.');
  for (const id of expectedIds) {
    const service = serviceById.get(id);
    const failed = BETA_RUN_33530702897.failedServices[id];
    if (failed) {
      if (
        service.latestCreatedRevision !== failed.latestCreatedRevision
        || service.latestReadyRevision !== failed.latestReadyRevision
        || !hasFullReadyTraffic(service)
      ) fail(`failed Function ${id} no longer has the audited failed/serving revision pair.`);
    } else if (
      !service.latestReadyRevision
      || service.latestCreatedRevision !== service.latestReadyRevision
      || service.terminalState !== 'CONDITION_SUCCEEDED'
      || !hasFullReadyTraffic(service)
    ) fail(`Function ${id} is no longer in the audited ready candidate state.`);
  }
  if (
    storeAssetProof?.status !== 200
    || /^(?:application|text)\/javascript(?:;|$)/i.test(String(storeAssetProof?.contentType || ''))
  ) fail('the unreleased candidate Store asset no longer resolves to the audited HTML fallback.');

  const state = {
    rootAsset: liveFingerprint.rootAsset,
    storeAsset: liveFingerprint.storeAsset,
    releaseMetadata: liveFingerprint.releaseMetadata,
    functions: normalizedFunctions,
    services: [...serviceById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    storeAssetProof
  };
  return { incidentId: BETA_RUN_33530702897.id, fingerprint: digest(state), state };
};

export const assertBetaRun33530702897CandidateArtifact = manifest => {
  if (
    manifest?.sourceCommit !== BETA_RUN_33530702897.candidateCommit
    || manifest?.sourceTree !== BETA_RUN_33530702897.candidateSourceTree
    || manifest?.entryAsset !== BETA_RUN_33530702897.storeAsset
    || manifest?.storeShellAsset !== BETA_RUN_33530702897.storeAsset
  ) fail('the rebuilt candidate does not reproduce the Store shell from the failed release.');
};

const requiredSuccesses = [
  'Verify exact approved candidate SHA',
  'Validate actual release candidate with immutable trusted gate',
  'Run complete immutable trusted candidate regression gate',
  'Run Store Sets Firestore authorization suite',
  'Authenticate to Beta only'
];

const assertAttempt = ({ jobs, attempt, expectedJobId }) => {
  if (jobs?.length !== 1) fail(`attempt ${attempt} does not contain exactly one deployment job.`);
  const job = jobs[0];
  if (
    String(job.id || '') !== expectedJobId
    || job.name !== 'deploy-beta'
    || job.conclusion !== 'failure'
    || Number(job.run_attempt) !== attempt
    || job.head_sha !== BETA_RUN_33530702897.candidateCommit
  ) fail(`attempt ${attempt} is not the exact audited failed deployment job.`);
  if (requiredSuccesses.some(name => !job.steps?.some(step => step.name === name && step.conclusion === 'success'))) {
    fail(`attempt ${attempt} did not pass every protected pre-deployment gate.`);
  }
  if (!job.steps?.some(step => step.name === 'Run canonical protected full-resource Beta release' && step.conclusion === 'failure')) {
    fail(`attempt ${attempt} did not fail in the canonical deployment step.`);
  }
};

export const assertBetaRun33530702897FailedRun = ({ run, attemptOneJobs, attemptTwoJobs, attemptOneLog, attemptTwoLog }) => {
  if (
    String(run?.id || '') !== BETA_RUN_33530702897.failedRunId
    || run?.name !== 'Beta Release'
    || run?.run_number !== BETA_RUN_33530702897.failedRunNumber
    || run?.run_attempt !== 2
    || run?.event !== 'workflow_dispatch'
    || run?.head_branch !== 'main'
    || run?.head_sha !== BETA_RUN_33530702897.candidateCommit
    || run?.conclusion !== 'failure'
    || run?.path !== '.github/workflows/deploy-beta.yml'
  ) fail('GitHub does not identify the exact authorized failed Beta Release run.');
  assertAttempt({ jobs: attemptOneJobs, attempt: 1, expectedJobId: BETA_RUN_33530702897.attemptOneJobId });
  assertAttempt({ jobs: attemptTwoJobs, attempt: 2, expectedJobId: BETA_RUN_33530702897.attemptTwoJobId });
  for (const marker of [
    'parseResumeToPortfolio',
    'reviewStoreManualPayment',
    'syncPublicChefProfile',
    'Container Healthcheck failed'
  ]) if (!String(attemptOneLog).includes(marker)) fail(`attempt 1 logs are missing ${marker}.`);
  if (!String(attemptTwoLog).includes('Live Beta Hosting and public Store assets do not identify one coherent release.')) {
    fail('attempt 2 logs do not contain the audited coherent-release refusal.');
  }
};

export const verifyBetaRun33530702897FailedRun = async ({ repository, token = '', request = fetch }) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !token) {
    fail('the protected workflow repository identity or GitHub token is unavailable.');
  }
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` };
  const api = `https://api.github.com/repos/${repository}`;
  const runUrl = `${api}/actions/runs/${BETA_RUN_33530702897.failedRunId}`;
  const urls = [
    runUrl,
    `${runUrl}/attempts/1/jobs?per_page=100`,
    `${runUrl}/attempts/2/jobs?per_page=100`,
    `${api}/actions/jobs/${BETA_RUN_33530702897.attemptOneJobId}/logs`,
    `${api}/actions/jobs/${BETA_RUN_33530702897.attemptTwoJobId}/logs`
  ];
  const responses = await Promise.all(urls.map(url => request(url, { headers, redirect: 'follow' })));
  if (responses.some(response => !response.ok)) fail('GitHub incident provenance could not be read completely.');
  const [run, attemptOne, attemptTwo, attemptOneLog, attemptTwoLog] = await Promise.all([
    responses[0].json(), responses[1].json(), responses[2].json(), responses[3].text(), responses[4].text()
  ]);
  assertBetaRun33530702897FailedRun({
    run,
    attemptOneJobs: attemptOne.jobs,
    attemptTwoJobs: attemptTwo.jobs,
    attemptOneLog,
    attemptTwoLog
  });
};

export const assertBetaRun33530702897RecoveryConverged = ({ liveFingerprint, functions, services, manifest, assetProof }) => {
  if (
    liveFingerprint?.releaseCommit !== BETA_RUN_33530702897.candidateCommit
    || liveFingerprint?.releaseSourceTree !== BETA_RUN_33530702897.candidateSourceTree
    || liveFingerprint?.releaseProtectedBaseline !== MANDATORY_BETA_BASELINE
    || !same(liveFingerprint?.releaseMetadata, manifest)
  ) fail('the live manifest does not identify the exact immutable recovery candidate.');
  if (liveFingerprint.rootAsset !== manifest.entryAsset || liveFingerprint.storeAsset !== manifest.entryAsset) {
    fail('root Hosting and public Store do not reference the same candidate asset.');
  }
  if (
    assetProof?.status !== 200
    || !/^(?:application|text)\/javascript(?:;|$)/i.test(String(assetProof?.contentType || ''))
    || assetProof?.sha256 !== manifest.entryAssetSha256
  ) fail('the candidate asset is not served as the expected JavaScript bytes.');

  const actualFunctions = normalizeBetaFunctions(functions);
  const expectedFunctions = expectedCandidateFunctions();
  if (!same(actualFunctions.map(item => item.id), expectedFunctions.map(item => item.id))) {
    fail('the recovered Function inventory is not exactly 41 Functions.');
  }
  const actualById = new Map(actualFunctions.map(item => [item.id, item]));
  for (const expected of expectedFunctions) {
    const actual = actualById.get(expected.id);
    if (actual?.state !== 'ACTIVE' || actual.hash !== expected.hash || actual.configurationHash !== expected.configurationHash) {
      fail(`Function ${expected.id} is not ACTIVE with the authorized candidate source and configuration.`);
    }
  }

  const serviceById = new Map((services || []).map(item => [item.id, item]));
  if (!same([...serviceById.keys()].sort(), expectedFunctions.map(item => item.id))) {
    fail('the recovered Cloud Run inventory is not exactly 41 Function services.');
  }
  for (const expected of expectedFunctions) {
    const service = serviceById.get(expected.id);
    if (
      !service?.latestReadyRevision
      || service.latestCreatedRevision !== service.latestReadyRevision
      || service.terminalState !== 'CONDITION_SUCCEEDED'
      || !hasFullReadyTraffic(service)
    ) fail(`Function ${expected.id} does not have a ready candidate revision serving 100% traffic.`);
    const priorFailure = BETA_RUN_33530702897.failedServices[expected.id];
    if (priorFailure && service.latestReadyRevision === priorFailure.latestReadyRevision) {
      fail(`previously failed Function ${expected.id} is still serving its prior revision.`);
    }
  }
};

export const readBetaFunctionState = ({ run = execFileSync } = {}) => {
  const output = run('firebase', ['functions:list', '--project', BETA_PROJECT_ID, '--json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']
  });
  const parsed = JSON.parse(output);
  if (parsed?.status !== 'success' || !Array.isArray(parsed.result)) fail('Firebase did not return a readable Function inventory.');
  return normalizeBetaFunctions(parsed.result);
};

export const loadCloudRunServicesWithFirebaseCli = async ({ firebaseRequire, projectId = BETA_PROJECT_ID }) => {
  const { requireAuth } = firebaseRequire('./lib/requireAuth.js');
  const { Client } = firebaseRequire('./lib/apiv2.js');
  const { runOrigin } = firebaseRequire('./lib/api.js');
  if (typeof requireAuth !== 'function' || typeof Client !== 'function' || typeof runOrigin !== 'function') {
    fail('the pinned Firebase CLI does not expose its required ADC Cloud Run client.');
  }
  await requireAuth({ project: projectId });
  const client = new Client({ urlPrefix: runOrigin(), auth: true, apiVersion: 'v2' });
  const services = [];
  let pageToken = '';
  do {
    const queryParams = { pageSize: 100 };
    if (pageToken) queryParams.pageToken = pageToken;
    const response = await client.get(`/projects/${projectId}/locations/-/services`, { queryParams });
    if (response.status !== 200 || !response.body || !Array.isArray(response.body.services || [])) {
      fail(`Cloud Run service inventory returned an unreadable HTTP ${response.status}.`);
    }
    services.push(...(response.body.services || []));
    pageToken = response.body.nextPageToken || '';
  } while (pageToken);
  return services;
};

export const readCloudRunServiceState = async ({ firebaseToolsRoot = '', loadServices } = {}) => {
  let services;
  if (loadServices) {
    services = await loadServices(BETA_PROJECT_ID);
  } else {
    if (!path.isAbsolute(firebaseToolsRoot)) fail('the pinned Firebase CLI root is unavailable.');
    const firebaseRequire = createRequire(path.join(firebaseToolsRoot, 'package.json'));
    services = await loadCloudRunServicesWithFirebaseCli({ firebaseRequire });
  }

  const idByServiceName = new Map(expectedCandidateFunctions().map(item => [item.id.toLowerCase(), item.id]));
  return services.map(service => {
    const serviceName = String(service.name || '').split('/').at(-1);
    const id = idByServiceName.get(serviceName);
    if (!id) return null;
    return {
      id,
      latestCreatedRevision: String(service.latestCreatedRevision || '').split('/').at(-1),
      latestReadyRevision: String(service.latestReadyRevision || '').split('/').at(-1),
      terminalState: String(service.terminalCondition?.state || ''),
      trafficStatuses: (service.trafficStatuses || []).map(item => ({
        type: item.type || '',
        revision: String(item.revision || '').split('/').at(-1),
        percent: Number(item.percent || 0)
      }))
    };
  }).filter(Boolean).sort((left, right) => left.id.localeCompare(right.id));
};

export const readLiveAssetProof = async ({ origin, asset, request = fetch }) => {
  const response = await request(`${origin}${asset}?beta-recovery-check=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache, no-store' }, redirect: 'follow'
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

export const readLiveReleaseMetadata = async ({
  origin = 'https://misechef-beta-fa4bf.web.app',
  request = fetch
} = {}) => {
  const response = await request(`${origin}/.well-known/misechef-beta-release.json?beta-recovery-check=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache, no-store' }, redirect: 'follow'
  });
  if (!response.ok) fail('the live release manifest could not be read.');
  try {
    return await response.json();
  } catch {
    fail('the live release manifest is not valid JSON.');
  }
};
