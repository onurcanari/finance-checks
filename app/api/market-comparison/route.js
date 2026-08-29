import { NextResponse } from 'next/server';

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FRED_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/global/market_cap_chart?vs_currency=usd&days=1825';
const TIMEOUT_MS = 12000;
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const periodKeys = ['weekly', 'monthly', '3m', '6m', 'ytd', '1y', '3y', '5y'];
const responseOptions = { headers: { 'Cache-Control': 'no-store' } };

function isValidDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return isValidDate(date) && date.toISOString().slice(0, 10) === trimmed ? date : null;
}

function parseEvdsDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const isoDate = parseDate(trimmed);
  if (isoDate) return isoDate;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return isValidDate(date) && date.toISOString().slice(0, 10) === `${match[3]}-${match[2]}-${match[1]}` ? date : null;
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function observations(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item || !isValidDate(item.date) || !Number.isFinite(item.value) || item.value <= 0) continue;
    unique.set(item.date.toISOString().slice(0, 10), { date: item.date, value: item.value });
  }
  return [...unique.values()].sort((a, b) => a.date - b.date);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw Error(`Upstream returned ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw Error('Upstream returned an empty response');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseFred(text, seriesCode) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw Error('Invalid FRED CSV');
  const header = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const dateIndex = header.indexOf('observation_date');
  const valueIndex = header.indexOf(seriesCode.toLowerCase());
  if (dateIndex < 0 || valueIndex < 0) throw Error('Unexpected FRED CSV columns');
  return observations(lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return { date: parseDate(fields[dateIndex]), value: number(fields[valueIndex]) };
  }));
}

function parseYahoo(text) {
  const payload = JSON.parse(text);
  const chart = payload?.chart?.result?.[0];
  const timestamps = chart?.timestamp;
  const closes = chart?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length !== closes.length) {
    throw Error('Invalid Yahoo chart response');
  }
  return observations(timestamps.map((timestamp, index) => ({
    date: new Date(Number(timestamp) * 1000),
    value: number(closes[index]),
  })));
}

function parseCoinGecko(text) {
  const payload = JSON.parse(text);
  const points = payload?.market_cap;
  if (!Array.isArray(points)) throw Error('Invalid CoinGecko market cap response');
  return observations(points.map(([timestamp, value]) => ({
    date: new Date(Number(timestamp)),
    value: number(value),
  })));
}

async function loadYahoo(ticker) {
  const data = parseYahoo(await fetchText(`${YAHOO_URL}/${encodeURIComponent(ticker)}?range=5y&interval=1d`));
  if (data.length < 2) throw Error(`${ticker} has insufficient observations`);
  return { data, source: 'Yahoo Finance chart API' };
}

async function loadFred(seriesCode) {
  const data = parseFred(await fetchText(`${FRED_URL}?id=${encodeURIComponent(seriesCode)}`), seriesCode);
  if (data.length < 2) throw Error(`${seriesCode} has insufficient observations`);
  return { data, source: `FRED CSV (${seriesCode})` };
}

function deriveGramGold(gold, usdTry) {
  const usdByDate = new Map(usdTry.map((item) => [item.date.toISOString().slice(0, 10), item.value]));
  return observations(gold.flatMap((item) => {
    const rate = usdByDate.get(item.date.toISOString().slice(0, 10));
    return rate ? [{ date: item.date, value: (item.value * rate) / GRAMS_PER_TROY_OUNCE }] : [];
  }));
}

async function loadGramGold() {
  const [gold, usdTry] = await Promise.all([loadYahoo('XAUUSD=X'), loadYahoo('USDTRY=X')]);
  const data = deriveGramGold(gold.data, usdTry.data);
  if (data.length < 2) throw Error('Gram Gold TL has insufficient aligned observations');
  return { data, source: 'Yahoo Finance chart API (XAU/USD × USD/TRY ÷ 31.1034768)' };
}

function parseEvds(text, seriesCode) {
  const payload = JSON.parse(text);
  if (!payload || !Array.isArray(payload.items)) throw Error('Invalid EVDS response');
  const itemKey = seriesCode.toLowerCase();
  return observations(payload.items.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const valueKey = Object.keys(item).find((key) => key.toLowerCase() === itemKey);
    const dateKey = Object.keys(item).find((key) => /^(tarih|date)$/i.test(key));
    return { date: parseEvdsDate(item[dateKey]), value: number(item[valueKey]) };
  }));
}

async function loadEvds(seriesCode) {
  const apiKey = process.env.EVDS_API_KEY?.trim();
  if (!apiKey) throw Error('EVDS_API_KEY is not configured');
  const end = new Date();
  const start = addMonths(end, -60);
  const format = (date) => `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  const url = `https://evds2.tcmb.gov.tr/service/evds/series=${encodeURIComponent(seriesCode)}&startDate=${format(start)}&endDate=${format(end)}&type=json&key=${encodeURIComponent(apiKey)}`;
  const data = parseEvds(await fetchText(url), seriesCode);
  if (data.length < 2) throw Error(`${seriesCode} has insufficient observations`);
  return { data, source: `EVDS (TCMB, ${seriesCode})` };
}

function addMonths(date, amount) {
  const targetMonth = date.getUTCMonth() + amount;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), targetMonth, Math.min(date.getUTCDate(), lastDay)));
}

function periodStart(key, end) {
  if (key === 'weekly') return new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (key === 'monthly') return addMonths(end, -1);
  if (key === '3m') return addMonths(end, -3);
  if (key === '6m') return addMonths(end, -6);
  if (key === 'ytd') return new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  if (key === '1y') return addMonths(end, -12);
  if (key === '3y') return addMonths(end, -36);
  return addMonths(end, -60);
}

function calculatePeriods(series) {
  const result = Object.fromEntries(periodKeys.map((key) => [key, []]));
  const end = series.data.at(-1);
  if (!end) return result;
  for (const key of periodKeys) {
    const startBoundary = periodStart(key, end.date);
    const start = key === 'ytd'
      ? series.data.find((item) => item.date >= startBoundary)
      : [...series.data].reverse().find((item) => item.date <= startBoundary);
    if (!start || start.date.getTime() >= end.date.getTime() || start.value === end.value) continue;
    const value = (end.value / start.value - 1) * 100;
    if (!Number.isFinite(value) || value === 0) continue;
    result[key].push({ id: series.id, shortName: series.shortName, name: series.name, value });
  }
  return result;
}

async function loadSeries(config) {
  const loaded = await config.load();
  const data = Array.isArray(loaded) ? loaded : loaded?.data;
  if (!Array.isArray(data) || data.length < 2) throw Error(`${config.id} has insufficient observations`);
  return { ...config, ...(Array.isArray(loaded) ? {} : { source: loaded.source }), data };
}

function makeHighlights(periods) {
  const focusRows = periods.monthly.length
    ? periods.monthly
    : periodKeys.map((key) => periods[key]).find((rows) => rows.length) || [];
  if (!focusRows.length) return [];
  const leader = focusRows.reduce((best, row) => (row.value > best.value ? row : best));
  const positive = focusRows.filter((row) => row.value > 0).length;
  return [
    { label: 'TOP PERFORMANCE', value: leader.value, detail: leader.name },
    { label: 'POSITIVE ASSETS', value: positive, detail: `Among ${focusRows.length} valid assets` },
    { label: 'MONTHLY LEADER', value: leader.value, detail: `${leader.name} · monthly change` },
  ];
}

function metric(id, label, source, load) {
  return { id, shortName: label, name: label, source, load };
}

function configuredEvdsMetric(envName, id, label) {
  const seriesCode = process.env[envName]?.trim();
  return seriesCode ? metric(id, label, `EVDS (TCMB, ${seriesCode})`, () => loadEvds(seriesCode)) : metric(id, label, 'EVDS (TCMB; provider configuration required)', async () => { throw Error(`${label} is not configured`); });
}

function yahooMetric(id, label, ticker) {
  return metric(id, label, 'Yahoo Finance chart API', () => loadYahoo(ticker));
}

function fredMetric(id, label, seriesCode) {
  return metric(id, label, `FRED CSV (${seriesCode})`, () => loadFred(seriesCode));
}

async function loadProfile(config) {
  const loaded = (await Promise.all(config.metrics.map(async (item) => {
    try {
      return await loadSeries(item);
    } catch {
      return null;
    }
  }))).filter(Boolean);

  const periods = Object.fromEntries(periodKeys.map((key) => [key, []]));
  const loadedWithPeriods = new Set();
  for (const series of loaded) {
    const seriesPeriods = calculatePeriods(series);
    if (periodKeys.some((key) => seriesPeriods[key].length)) loadedWithPeriods.add(series.id);
    for (const key of periodKeys) periods[key].push(...seriesPeriods[key]);
  }
  const unavailable = config.metrics
    .filter((item) => !loadedWithPeriods.has(item.id))
    .map((item) => item.name);
  const sources = [...new Set(loaded.map((item) => item.source))];
  return {
    label: config.label,
    periods,
    highlights: makeHighlights(periods),
    source: sources.length ? sources.join(' · ') : [...new Set(config.metrics.map((item) => item.source))].join(' · '),
    unavailable,
  };
}

export async function GET() {
  const usdTry = yahooMetric('usdtry', 'USD/TRY', 'USDTRY=X');
  const profiles = [
    {
      label: 'Turkey',
      metrics: [
        usdTry,
        yahooMetric('eurtry', 'EUR/TRY', 'EURTRY=X'),
        yahooMetric('bist100', 'BIST 100', 'XU100.IS'),
        yahooMetric('bistbank', 'BIST Bank', 'XU070.IS'),
        yahooMetric('bistindustrial', 'BIST Industrial', 'XUSIN.IS'),
        fredMetric('cpi', 'CPI', 'TURCPIALLMINMEI'),
        configuredEvdsMetric('EVDS_TURKEY_PPI_SERIES', 'ppi', 'PPI'),
        configuredEvdsMetric('EVDS_TURKEY_POLICY_SERIES', 'policy', 'TCMB policy rate'),
        configuredEvdsMetric('EVDS_TURKEY_2Y_SERIES', 'turkey2y', 'Turkey 2Y yield'),
        metric('gramgold', 'Gram Gold TL', 'Yahoo Finance chart API (aligned XAU/USD and USD/TRY)', loadGramGold),
        configuredEvdsMetric('EVDS_TURKEY_CDS_SERIES', 'cds', 'Turkey CDS'),
      ],
    },
    {
      label: 'US',
      metrics: [
        yahooMetric('nasdaq', 'Nasdaq', '^IXIC'),
        yahooMetric('sp500', 'S&P 500', '^GSPC'),
        yahooMetric('dxy', 'DXY', 'DX-Y.NYB'),
        fredMetric('fed', 'Fed policy rate', 'DFF'),
        fredMetric('us10y', 'US 10Y', 'DGS10'),
        fredMetric('vix', 'VIX', 'VIXCLS'),
        yahooMetric('xauusd', 'XAU/USD', 'XAUUSD=X'),
        yahooMetric('amd', 'AMD', 'AMD'),
        yahooMetric('aapl', 'AAPL', 'AAPL'),
        yahooMetric('rklb', 'RKLB', 'RKLB'),
        yahooMetric('alab', 'ALAB', 'ALAB'),
        yahooMetric('ufo', 'UFO Space ETF (Procure Space ETF)', 'UFO'),
      ],
    },
    {
      label: 'Crypto',
      metrics: [
        yahooMetric('btc', 'BTC', 'BTC-USD'),
        yahooMetric('eth', 'ETH', 'ETH-USD'),
        metric('cryptoMarketCap', 'Total crypto market cap', 'CoinGecko global market cap API', async () => {
          const data = parseCoinGecko(await fetchText(COINGECKO_URL));
          if (data.length < 2) throw Error('Total crypto market cap has insufficient observations');
          return { data, source: 'CoinGecko global market cap API' };
        }),
        yahooMetric('dxy', 'DXY', 'DX-Y.NYB'),
        fredMetric('us10y', 'US 10Y', 'DGS10'),
        fredMetric('vix', 'VIX', 'VIXCLS'),
      ],
    },
  ];

  const loadedProfiles = await Promise.all(profiles.map(loadProfile));
  const hasObservations = loadedProfiles.some((profile) => periodKeys.some((key) => profile.periods[key].length));
  const body = { updatedAt: new Date().toISOString(), profiles: {
    turkey: loadedProfiles[0],
    us: loadedProfiles[1],
    crypto: loadedProfiles[2],
  } };
  return NextResponse.json(body, { ...responseOptions, ...(hasObservations ? {} : { status: 502 }) });
}
