import { NextResponse } from 'next/server';
import { isHttpLink } from '../../../lib/links';
import { ENTITIES, isFocusId, newsSymbolsFor } from '../../../lib/supply-chain';

// Headlines for the company currently at the centre of the supply-chain map
// and its direct counterparties. This is the part of the page that genuinely
// moves during the day: the curated allocations change on a research cadence,
// the news about them changes hourly.
//
// Same Yahoo search-news pattern as app/api/stock-news/route.js. The symbol
// list comes from the graph via newsSymbolsFor(focus), never from the query
// string, so the route cannot be pointed at arbitrary symbols.

async function fetchSymbolNews(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0`, {
      signal: controller.signal,
      headers: { Referer: 'https://finance.yahoo.com/' },
      next: { revalidate: 600 },
    });
    if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
    const payload = await response.json();
    return (Array.isArray(payload.news) ? payload.news : [])
      // Yahoo pads thin symbols with unrelated trending stories — keep only
      // items actually tagged to this ticker.
      .filter((item) => item.title && isHttpLink(item.link) && item.providerPublishTime && item.relatedTickers?.includes(symbol))
      .map((item) => ({
        symbol,
        title: item.title,
        link: item.link,
        source: item.publisher || 'Yahoo Finance',
        publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
      }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  const focus = request.nextUrl.searchParams.get('focus') || 'nvidia';
  if (!isFocusId(focus)) {
    return NextResponse.json({ error: 'focus must be one of the supply-chain focus entities' }, { status: 400 });
  }
  const symbols = newsSymbolsFor(focus);
  if (!symbols.length) {
    // A private focus (OpenAI) has no tradable counterparty symbol of its own;
    // that is an empty result, not an error.
    return NextResponse.json({ focus, items: [], symbols: [], updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const results = await Promise.allSettled(symbols.map(fetchSymbolNews));
  if (results.every((result) => result.status === 'rejected')) {
    return NextResponse.json({ error: 'Supply-chain news is unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const names = Object.fromEntries(Object.values(ENTITIES).filter((entity) => entity.symbol).map((entity) => [entity.symbol, entity.name]));
  const seen = new Set();
  const items = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .map((item) => ({ ...item, company: names[item.symbol] || item.symbol }))
    // One story is often tagged to several tickers in this map (an Nvidia
    // supply piece hits NVDA and TSM). Keep the first occurrence only, so the
    // strip lists each headline once and link stays a usable React key.
    .filter((item) => !seen.has(item.link) && seen.add(item.link))
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 24);

  return NextResponse.json(
    { focus, symbols, items, updatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
