import { NextResponse } from 'next/server';

const sectors = { XLE: 'Energy', XLF: 'Financials', XLI: 'Industrials', XLB: 'Materials', XLV: 'Health Care', XLP: 'Consumer Staples', XLU: 'Utilities', XLRE: 'Real Estate', XLC: 'Communication', XLY: 'Consumer Discretionary', XLK: 'Technology' };
const assets = { SPY: 'US Equities', TLT: 'US Bonds', GLD: 'Gold', USO: 'Oil' };
const themes = [
  ['SMH', 'Semiconductors'], ['SOXX', 'Semiconductors'], ['SMH', 'Semiconductor Equipment'], ['SOXX', 'Semiconductor Equipment'],
  ['SMH', 'Memory'], ['SMH', 'Photonics'], ['FIBR', 'Optical Networking'], ['AIQ', 'AI Infrastructure'], ['ROBT', 'AI Infrastructure'],
  ['BOTZ', 'Robotics'], ['ROBO', 'Robotics'], ['QTUM', 'Quantum'], ['IGV', 'Software'], ['CIBR', 'Cybersecurity'], ['HACK', 'Cybersecurity'], ['MAGS', 'Hyperscalers'],
  ['OIH', 'Oil Services'], ['XLE', 'Oil & Gas'], ['NLR', 'Nuclear'], ['URA', 'Nuclear'], ['TAN', 'Solar'], ['GRID', 'Grid Infrastructure'], ['XLU', 'Power Generation'],
  ['SRVR', 'Data Center Infrastructure'], ['DTCR', 'Data Center Infrastructure'], ['SRVR', 'Neocloud/Data Center'], ['DTCR', 'Neocloud/Data Center'],
  ['GDX', 'Gold Miners'], ['GDXJ', 'Gold Miners'], ['SIL', 'Silver Miners'], ['SILJ', 'Silver Miners'], ['COPX', 'Copper'], ['SLX', 'Steel'],
  ['KBE', 'Banks'], ['KRE', 'Banks'], ['KCE', 'Capital Markets'], ['KIE', 'Insurance'], ['FINX', 'Fintech'], ['BITQ', 'Crypto'], ['IBIT', 'Crypto'],
  ['XLY', 'Consumer Growth'], ['XRT', 'Retail'], ['XLC', 'AdTech'], ['KWEB', 'China Internet'],
  ['ITA', 'Defense'], ['PPA', 'Defense'], ['ITA', 'Aerospace'], ['PPA', 'Aerospace'], ['UFO', 'Space'], ['ARKX', 'Space'],
  ['XBI', 'Biotechnology'], ['IBB', 'Biotechnology'], ['IHI', 'Medical Devices'], ['XLV', 'Healthcare'],
  ['XLI', 'Industrials'], ['ITB', 'Construction'], ['PAVE', 'Construction'],
];

async function quote(ticker) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=10d&interval=1d`, { cache: 'no-store' });
  if (!response.ok) throw Error(`${ticker}: ${response.status}`);
  const data = (await response.json()).chart.result[0];
  const closes = (Array.isArray(data.indicators.quote[0].close) ? data.indicators.quote[0].close : []).filter(Number.isFinite);
  const last = data.meta.regularMarketPrice || closes.at(-1);
  return { ticker, price: Number.isFinite(last) ? last : null, oneDay: (last / closes.at(-2) - 1) * 100, fiveDay: (last / closes.at(-6) - 1) * 100 };
}

export async function GET() {
  try {
    const tickers = [...new Set(['SPY', ...Object.keys(sectors), ...Object.keys(assets), ...themes.map(([ticker]) => ticker)])];
    const quotes = await Promise.all(tickers.map(quote));
    const spy = quotes.find(({ ticker }) => ticker === 'SPY');
    const named = (map) => quotes.filter(({ ticker }) => map[ticker]).map((quote) => ({ ...quote, name: map[quote.ticker] }));
    const themeQuotes = new Map(quotes.map((quote) => [quote.ticker, quote]));
    return NextResponse.json({
      source: 'Yahoo Finance chart API', updatedAt: new Date().toISOString(), spy,
      sectors: named(sectors).map((sector) => ({
        ...sector,
        rs: sector.oneDay - spy.oneDay,
        score: Math.max(0, Math.min(100, Math.round(50 + sector.oneDay * 9 + sector.fiveDay * 3 + (sector.oneDay - spy.oneDay) * 12))),
      })),
      assets: named(assets), themes: themes.map(([ticker, name]) => ({ ...themeQuotes.get(ticker), name })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
