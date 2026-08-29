import { NextResponse } from 'next/server';

const instruments = [
  ['^TNX', 'US 10Y'],
  ['^FVX', 'US 5Y'],
  ['^TYX', 'US 30Y'],
  ['DX-Y.NYB', 'DXY'],
];

async function quote([symbol, label]) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`, { signal: AbortSignal.timeout(10000), next: { revalidate: 900 } });
  if (!response.ok) throw Error(`${symbol}: ${response.status}`);
  const data = (await response.json()).chart.result[0];
  const closes = (Array.isArray(data.indicators.quote[0].close) ? data.indicators.quote[0].close : []).filter(Number.isFinite);
  const last = data.meta.regularMarketPrice || closes.at(-1);
  return { symbol, label, value: Number.isFinite(last) ? last : null, oneDay: (last / closes.at(-2) - 1) * 100 };
}

export async function GET() {
  try {
    const rates = await Promise.all(instruments.map(quote));
    return NextResponse.json({ rates, source: 'yahoo', updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
