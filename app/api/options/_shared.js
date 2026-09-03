import { NextResponse } from 'next/server';

// Shared between /api/options/chain and /api/options/expirations.
// Kept tiny on purpose: it only owns the bits that genuinely repeat (cache
// header, symbol regex, error -> status mapping). Date validation lives here
// too so the chain route can reject obvious junk before calling Tradier.

export const SYMBOL_PATTERN = /^[A-Za-z0-9.^_=-]{1,32}$/;
export const EXPIRATION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export function invalidParams() {
  return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
}

export function isPlausibleExpiration(yyyyMmDd) {
  if (!EXPIRATION_PATTERN.test(yyyyMmDd)) return false;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Reject Feb 30, Apr 31, etc. by checking the round-trip.
  const rebuilt = new Date(Date.UTC(y, m - 1, d));
  return (
    rebuilt.getUTCFullYear() === y &&
    rebuilt.getUTCMonth() === m - 1 &&
    rebuilt.getUTCDate() === d
  );
}

export function optionsErrorResponse(error) {
  const message = error?.message || 'fetch_failed';

  if (message === 'rate_limited') {
    const retryAfter = Number.isFinite(error.retryAfter) ? error.retryAfter : 60;
    return NextResponse.json(
      { error: 'rate_limited', retryAfter },
      { status: 502, headers: { ...CACHE_HEADERS, 'Retry-After': String(retryAfter) } },
    );
  }

  if (message === 'local_rate_limited') {
    return NextResponse.json(
      { error: 'local_rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  if (message === 'TRADIER_API_KEY missing') {
    return NextResponse.json(
      { error: 'config_missing', detail: 'TRADIER_API_KEY missing' },
      { status: 500 },
    );
  }

  if (message.startsWith('upstream:')) {
    const status = parseInt(message.slice('upstream:'.length), 10);
    return NextResponse.json(
      { error: 'upstream', status: Number.isFinite(status) ? status : null },
      { status: 502, headers: CACHE_HEADERS },
    );
  }

  return NextResponse.json({ error: 'fetch_failed' }, { status: 502, headers: CACHE_HEADERS });
}