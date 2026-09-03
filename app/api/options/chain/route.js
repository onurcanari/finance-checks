import { NextResponse } from 'next/server';
import { getProvider } from '../../../lib/options-providers';
import {
  CACHE_HEADERS,
  EXPIRATION_PATTERN,
  SYMBOL_PATTERN,
  invalidParams,
  isPlausibleExpiration,
  optionsErrorResponse,
} from '../_shared';

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const expiration = request.nextUrl.searchParams.get('expiration');

  if (!symbol || !expiration) return invalidParams();
  if (!SYMBOL_PATTERN.test(symbol)) return invalidParams();
  if (!EXPIRATION_PATTERN.test(expiration) || !isPlausibleExpiration(expiration)) {
    return invalidParams();
  }

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
    return optionsErrorResponse(error);
  }
}