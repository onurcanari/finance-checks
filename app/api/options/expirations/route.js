import { NextResponse } from 'next/server';
import { getProvider } from '../../../lib/options-providers';
import {
  CACHE_HEADERS,
  SYMBOL_PATTERN,
  invalidParams,
  optionsErrorResponse,
} from '../_shared';

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol || !SYMBOL_PATTERN.test(symbol)) return invalidParams();

  try {
    const provider = getProvider('tradier');
    const expirations = await provider.getExpirations(symbol);
    return NextResponse.json({ symbol, expirations }, { headers: CACHE_HEADERS });
  } catch (error) {
    return optionsErrorResponse(error);
  }
}