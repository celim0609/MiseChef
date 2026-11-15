// This retired export has different deployed transports in the two projects.
// Preserve both identities; neither transport may instantiate a booking provider.
export const dispatchCompatibilityProject = (env = process.env) => {
  let configured;
  try { configured = env.FIREBASE_CONFIG ? JSON.parse(env.FIREBASE_CONFIG).projectId : undefined; }
  catch { throw new Error('Invalid Firebase project configuration for legacy dispatch.'); }
  const projects = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT, configured].filter(Boolean);
  if (new Set(projects).size > 1) throw new Error('Conflicting Firebase project identities for legacy dispatch.');
  const project = projects[0];
  // Node's unit-test imports have no deployment project and can only expose the inert HTTP stub.
  if (!project && env.NODE_TEST_CONTEXT) return 'misechef-fa4bf';
  if (!['misechef-fa4bf', 'misechef-beta-fa4bf'].includes(project)) throw new Error('Legacy dispatch requires an explicit supported Firebase project.');
  return project;
};
export const retiredDispatchHttp = (_request, response) => response.status(410).json({
  code: 'MANUAL_DISPATCH_REQUIRED',
  message: 'Automatic dispatch is disabled. Use the authenticated merchant preview and confirmation flow.'
});
export const inertDispatchEvent = async () => undefined;
