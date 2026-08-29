// Shared link helpers.
// Only http(s) links are treated as safe to open; all other schemes
// (javascript:, data:, etc.) are rejected.
export function isHttpLink(url) {
  return typeof url === 'string' && url.length > 0 && /^https?:\/\//i.test(url);
}
