/**
 * Browser URL for a trust-engine HTTP endpoint, e.g. engineUrl('events').
 * Goes through the same-origin proxy app/engine/api/[...path]/route.ts
 * because the engine sends no CORS headers.
 */
export function engineUrl(path: 'events' | 'modal/selection', query = ''): string {
  return `/engine/api/${path}${query}`;
}
