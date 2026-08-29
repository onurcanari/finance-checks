import { NextResponse } from 'next/server';

const COINS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

// One Yahoo chart quote. Changes are measured from the corresponding daily
// closes returned by the one-month chart range.
async function coinQuote(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
    const data = (await response.json()).chart?.result?.[0];
    const closeValues = data?.indicators?.quote?.[0]?.close;
    const closes = (Array.isArray(closeValues) ? closeValues : []).filter(Number.isFinite);
    const last = Number.isFinite(data?.meta?.regularMarketPrice) ? data.meta.regularMarketPrice : closes.at(-1);
    if (!Number.isFinite(last) || closes.length < 2) throw new Error(`${symbol}: no price data`);
    return {
      symbol,
      price: last,
      oneDay: (last / closes.at(-2) - 1) * 100,
      sevenDay: (last / (closes[closes.length - 8] ?? closes[0]) - 1) * 100,
      thirtyDay: (last / closes[0] - 1) * 100,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Fear & Greed index. Optional input: any failure resolves to null instead of
// failing the whole snapshot.
async function fearGreedIndex() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`fng: ${response.status}`);
    const entry = (await response.json()).data?.[0];
    const value = Number(entry?.value);
    if (!entry || !Number.isFinite(value)) throw new Error('Invalid Fear & Greed response');
    const stamp = Number(entry.timestamp);
    return {
      value,
      classification: entry.value_classification,
      updatedAt: Number.isFinite(stamp) && stamp > 0 ? new Date(stamp * 1000).toISOString() : new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    const [coins, fearGreed] = await Promise.all([Promise.all(COINS.map(coinQuote)), fearGreedIndex()]);
    return NextResponse.json(
      { coins, source: 'yahoo', updatedAt: new Date().toISOString(), fearGreed },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
