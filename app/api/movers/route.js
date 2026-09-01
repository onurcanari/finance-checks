// Top Movers panel — Alpha Vantage TOP_GAINERS_LOSERS via the shared
// cache-first avClient. One AV call covers gainers, losers and most-active;
// the 15-minute TTL is a deliberate quota decision (~10 refreshes/day budget
// against the 25/day free limit).
//
// GET /api/movers
//
// Response:
//   { gainers, losers, active,   // normalized rows (numeric fields, % stripped)
//     lastUpdated,               // AV's own "last_updated" market timestamp
//     fetchedAt, stale, error, source: 'alphavantage' }
// Upstream failure prefers the cached copy (stale=true) over a 503; 503 only
// when there is truly nothing to show.

import { NextResponse } from 'next/server';
import { avFetch } from '../../lib/av-client';
import { normalizeMoversPayload } from '../../lib/movers';

const MOVERS_TTL_SECONDS = 900;

export async function GET() {
  const { data, fetchedAt, stale, error } = await avFetch(
    'TOP_GAINERS_LOSERS',
    {},
    { ttlSeconds: MOVERS_TTL_SECONDS },
  );

  if (!data) {
    // No cache anywhere (or config missing): nothing to show.
    return NextResponse.json(
      { error: error || 'upstream_unavailable' },
      { status: error === 'config_missing' ? 500 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { gainers, losers, active } = normalizeMoversPayload(data);
  return NextResponse.json(
    {
      gainers,
      losers,
      active,
      lastUpdated: typeof data?.last_updated === 'string' ? data.last_updated : null,
      fetchedAt,
      stale,
      error,
      source: 'alphavantage',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
