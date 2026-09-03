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
// NOTE: deliberately NO User-Agent header on Yahoo requests. Yahoo's bot
// protection (observed 2026-09-02) intermittently 429s requests that carry a
// browser-like UA while serving header-less requests fine — the exact inverse
// of what the UA was supposed to achieve. Every other Yahoo route in this app
// (market-snapshot, rates, crypto, tr-macro) fetches with NO custom headers and
// stays reliable. Do not reintroduce a UA here; if Yahoo starts blocking again,
// gate on the `unavailable` array in the /api/flow response instead.

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