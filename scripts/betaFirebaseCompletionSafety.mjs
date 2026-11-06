// An unfinished firebase-tools source-token retry can exit zero. Require explicit
// CLI completion as well as the existing exact-SHA web/asset postconditions.
export function assertBetaBuildOptimizationDisabled(enabled, env = process.env) {
  if (enabled || String(env.FIREBASE_CLI_EXPERIMENTS || '').split(',').map(value=>value.trim()).includes('functionsv2deployoptimizations')) {
    throw new Error('Unsafe Firebase source-token build optimization remains enabled.');
  }
}
export function assertBetaFirebaseDeployCompleted(result) {
  const text = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  if (result.status !== 0 || result.error || result.signal
    || !/Deploy complete!/.test(text) || !/hosting\[misechef-beta-fa4bf\]: release complete/.test(text)) {
    throw new Error('Firebase Beta full-resource deployment or Hosting release did not complete.');
  }
}
