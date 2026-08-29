// Shared, network-facing helpers used by both route handlers:
//   app/api/flow/route.js            (sector/theme flow)
//   app/api/flow/breadth/route.js    (sector breadth)
// Kept out of app/lib/flow.js so that lib stays pure (no fetch/abort I/O) —
// this file only does network work via globals and imports no `next/*` modules,
// so it can also be imported from a raw node script (see scripts/smoke-flow.mjs).
import {
  computePeriodReturns,
  computeRvol,
  extractCloses,
  extractVolumes,
} from '../../lib/flow.js';

export const YAHOO_RANGE = '3mo';
export const YAHOO_INTERVAL = '1d';
export const TIMEOUT_MS = 12_000;
export const CACHE_HEADER = 'public, s-maxage=120, stale-while-revalidate=600';
export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Pull a Yahoo chart for one ticker. Returns null on any failure (network,
// 429, 404, malformed payload) — callers treat null as "unavailable" so one
// bad ticker never drops the whole response.
export async function fetchChart(ticker) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${YAHOO_RANGE}&interval=${YAHOO_INTERVAL}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.indicators?.quote?.[0]) return null;
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}