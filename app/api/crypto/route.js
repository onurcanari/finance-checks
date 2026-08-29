import { NextResponse } from 'next/server';

const COINS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

// Shared fetch wrapper: aborts after 10s and always clears the timer (finally),
// so no timeout leaks whether the request succeeds or fails.
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
  } finally {
    clearTimeout(timeout);
  }
}

// One Yahoo chart quote. Changes are measured from the corresponding daily
// closes returned by the one-month chart range. Failures resolve to null so a
// single flaky symbol cannot take down the rest of the coins or the F&G panel.
async function coinQuote(symbol) {
  try {
    const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`);
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
  } catch {
    return null;
  }
}

// Fear & Greed index. Optional input: any failure resolves to null instead of
// failing the whole snapshot.
async function fearGreedIndex() {
  try {
    const response = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1');
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
  }
}

export async function GET() {
  try {
    const [coinResults, fearGreed] = await Promise.all([Promise.all(COINS.map(coinQuote)), fearGreedIndex()]);
    // Failed coins resolve to null and are omitted, so one flaky symbol cannot
    // blank the other coins or the F&G panel. The client renders an
    // empty-state row if all coins fail, so the page never crashes.
    const coins = coinResults.filter(Boolean);
    return NextResponse.json(
      { coins, source: 'yahoo', updatedAt: new Date().toISOString(), fearGreed },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}