import { NextResponse } from 'next/server';
import { getProvider } from '../../../lib/options-providers';

const SYMBOL_PATTERN = /^[A-Za-z0-9.^_=-]{1,32}$/;
const EXPIRATION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

function invalidParams() {
  return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
}

function errorResponse(error) {
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

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const expiration = request.nextUrl.searchParams.get('expiration');

  if (!symbol || !expiration) return invalidParams();
  if (!SYMBOL_PATTERN.test(symbol)) return invalidParams();
  if (!EXPIRATION_PATTERN.test(expiration)) return invalidParams();

  try {
    const provider = getProvider('tradier');
    const chain = await provider.getChain(symbol, expiration);
    return NextResponse.json(
      {
        symbol,
        spot: chain.spot,
        expiration,
        calls: chain.calls,
        puts: chain.puts,
        source: 'tradier',
        fetchedAt: new Date().toISOString(),
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}