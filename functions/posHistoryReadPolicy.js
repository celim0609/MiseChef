export const HISTORY_INITIALIZATION_NOTICE = 'Historical search is initializing. Showing loaded legacy orders only; search and counts are incomplete. Load older results to browse, or retry indexed search when initialization finishes.';
export function historyReadSource(readiness, cursorSource) {
  // A cursor must never cross collections when readiness changes between pages.
  if (cursorSource) return cursorSource;
  return readiness?.version === 1 && readiness.complete === true ? 'index' : 'legacy';
}
export const historyIndexUnavailable = error => String(error?.code || '').endsWith('failed-precondition') && /index/i.test(error?.message || '');
export async function withHistoryReadFallback({readiness,cursorSource,hasCursor,loadLegacy,loadIndex}) {
  if(historyReadSource(readiness,cursorSource)==='legacy')return loadLegacy();
  if(hasCursor && historyReadSource(readiness)!=='index')throw new Error('History index is reinitializing. Retry search to browse legacy orders while it completes.');
  try {return await loadIndex();}
  catch(error){if(!hasCursor && historyIndexUnavailable(error))return loadLegacy();throw error;}
}
