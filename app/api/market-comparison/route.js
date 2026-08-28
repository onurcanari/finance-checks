import { NextResponse } from 'next/server';

const FRED_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=TURCPIALLMINMEI';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';
const STOOQ_URL = 'https://stooq.com/q/d/l/';
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 12000;
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

function parseFred(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw Error('Invalid FRED CSV');
  const header = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const dateIndex = header.indexOf('observation_date');
  const valueIndex = header.indexOf('turcpiallminmei');
  if (dateIndex < 0 || valueIndex < 0) throw Error('Unexpected FRED CSV columns');
  return observations(lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return { date: parseDate(fields[dateIndex]), value: number(fields[valueIndex]) };
  }));
}

function parseFrankfurter(text) {
  const payload = JSON.parse(text);
  if (!payload || typeof payload.rates !== 'object' || Array.isArray(payload.rates)) throw Error('Invalid Frankfurter response');
  return observations(Object.entries(payload.rates).map(([dateValue, rates]) => ({
    date: parseDate(dateValue),
    value: number(rates?.TRY),
  })));
}

function parseStooq(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw Error('Invalid Stooq CSV');
  const header = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const dateIndex = header.indexOf('date');
  const closeIndex = header.indexOf('close');
  if (dateIndex < 0 || closeIndex < 0) throw Error('Unexpected Stooq CSV columns');
  return observations(lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return { date: parseDate(fields[dateIndex]), value: number(fields[closeIndex]) };
  }));
}

function parseYahoo(text) {
  const payload = JSON.parse(text);
  const chart = payload?.chart?.result?.[0];
  const timestamps = chart?.timestamp;
  const closes = chart?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length !== closes.length) throw Error('Invalid Yahoo chart response');
  return observations(timestamps.map((timestamp, index) => ({
    date: new Date(Number(timestamp) * 1000),
    value: number(closes[index]),
  })));
}

async function loadMarketData(stooqUrl, ticker, stooqSource) {
  try {
    const data = parseStooq(await fetchText(stooqUrl));
    if (data.length >= 2) return { data, source: stooqSource };
  } catch {
    // Yahoo is the verified fallback when Stooq is unavailable or malformed.
  }
  const data = parseYahoo(await fetchText(`${YAHOO_URL}/${encodeURIComponent(ticker)}?range=5y&interval=1d`));
  if (data.length < 2) throw Error(`${ticker} has insufficient observations`);
  return { data, source: 'Yahoo Finance chart API' };
}

function parseEvds(text, seriesCode) {
  const payload = JSON.parse(text);
  if (!payload || !Array.isArray(payload.items)) throw Error('Invalid EVDS response');
  const itemKey = seriesCode.toLowerCase();
  return observations(payload.items.map((item) => {
    if (!item || typeof item !== 'object') return {};
    const valueKey = Object.keys(item).find((key) => key.toLowerCase() === itemKey);
    const dateKey = Object.keys(item).find((key) => /^(tarih|date)$/i.test(key));
    return {
      date: parseEvdsDate(item[dateKey]),
      value: number(item[valueKey]),
    };
  }));
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
    { label: 'EN İYİ PERFORMANS', value: leader.value, detail: leader.name },
    { label: 'POZİTİF VARLIK SAYISI', value: positive, detail: `${focusRows.length} geçerli varlık içinde` },
    { label: 'AYLIK LİDER', value: leader.value, detail: `${leader.name} · aylık değişim` },
  ];
}

async function getEvdsSeries() {
  const apiKey = process.env.EVDS_API_KEY?.trim();
  const seriesCode = process.env.EVDS_DEPOSIT_SERIES?.trim();
  if (!apiKey || !seriesCode) return null;
  const end = new Date();
  const start = addMonths(end, -60);
  const format = (date) => `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  const url = `https://evds2.tcmb.gov.tr/service/evds/series=${encodeURIComponent(seriesCode)}&startDate=${format(start)}&endDate=${format(end)}&type=json&key=${encodeURIComponent(apiKey)}`;
  const data = parseEvds(await fetchText(url), seriesCode);
  return data.length >= 2 ? data : null;
}

export async function GET() {
  const configs = [
    { id: 'cpi', shortName: 'TÜFE', name: 'TÜFE · CPI index change', source: 'FRED (TURCPIALLMINMEI)', load: async () => parseFred(await fetchText(FRED_URL)) },
    { id: 'usdtry', shortName: 'USD/TRY', name: 'USD/TRY', source: 'Frankfurter server API', load: async () => {
      const end = new Date();
      const start = addMonths(end, -60);
      const format = (date) => date.toISOString().slice(0, 10);
      return parseFrankfurter(await fetchText(`${FRANKFURTER_URL}/${format(start)}..${format(end)}?from=USD&to=TRY`));
    } },
    { id: 'nasdaq', shortName: 'Nasdaq', name: 'Nasdaq Composite', source: 'Stooq (s=%5Eixic)', load: () => loadMarketData(`${STOOQ_URL}?s=%5Eixic&i=d`, '^IXIC', 'Stooq (s=%5Eixic)') },
    { id: 'gold', shortName: 'Altın', name: 'Gold (XAU/USD)', source: 'Stooq (s=xauusd)', load: () => loadMarketData(`${STOOQ_URL}?s=xauusd&i=d`, 'GC=F', 'Stooq (s=xauusd)') },
    { id: 'bist', shortName: 'BIST 100', name: 'BIST 100', source: 'Yahoo Finance chart API', load: () => loadMarketData('https://stooq.com/q/d/l/?s=xu100&i=d', 'XU100.IS', 'Stooq (s=xu100)') },
  ];
  if (process.env.EVDS_API_KEY?.trim() && process.env.EVDS_DEPOSIT_SERIES?.trim()) {
    configs.push({ id: 'deposit', shortName: 'Mevduat', name: 'Turkish deposit interest', source: 'EVDS (TCMB)', load: getEvdsSeries });
  }

  const loaded = (await Promise.all(configs.map(async (config) => {
    try {
      return await loadSeries(config);
    } catch {
      return null;
    }
  }))).filter(Boolean);

  const periods = Object.fromEntries(periodKeys.map((key) => [key, []]));
  for (const series of loaded) {
    const seriesPeriods = calculatePeriods(series);
    for (const key of periodKeys) periods[key].push(...seriesPeriods[key]);
  }
  if (!loaded.length || !periodKeys.some((key) => periods[key].length)) {
    return NextResponse.json({ error: 'No valid market observations available.' }, { ...responseOptions, status: 502 });
  }

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    source: loaded.map((series) => series.source).join(' · '),
    periods,
    highlights: makeHighlights(periods),
  }, responseOptions);
}
