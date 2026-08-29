// Flow layer — pure helpers + canonical sector/theme data shared between
// /api/flow, /api/flow/breadth, and the /flow page. Keep this file dependency-free
// so it can be unit-tested with `node --test` (no React, no Next imports).

// Canonical sector ETFs (11 GICS sectors, US-listed).
export const SECTORS = [
  { ticker: 'XLE', name: 'Energy' },
  { ticker: 'XLF', name: 'Financials' },
  { ticker: 'XLI', name: 'Industrials' },
  { ticker: 'XLB', name: 'Materials' },
  { ticker: 'XLV', name: 'Health Care' },
  { ticker: 'XLP', name: 'Consumer Staples' },
  { ticker: 'XLU', name: 'Utilities' },
  { ticker: 'XLRE', name: 'Real Estate' },
  { ticker: 'XLC', name: 'Communication' },
  { ticker: 'XLY', name: 'Consumer Discretionary' },
  { ticker: 'XLK', name: 'Technology' },
];

// Benchmark used to anchor the flow strip ("vs SPY", "SPY 1M", etc.).
export const BENCHMARK = { ticker: 'SPY', name: 'US Equities' };

// Theme ETFs — name is the *sub-theme* the ticker represents; one underlying
// ticker can appear in several sub-themes (e.g. SMH = Semiconductors AND Memory).
// The tuple is [ticker, subThemeName]. Sub-themes are not exposed externally —
// the page only sees a flat list of {ticker, name} per theme.
export const THEMES = [
  ['SMH', 'Semiconductors'], ['SOXX', 'Semiconductors'],
  ['SMH', 'Semiconductor Equipment'], ['SOXX', 'Semiconductor Equipment'],
  ['SMH', 'Memory'], ['SMH', 'Photonics'],
  ['FIBR', 'Optical Networking'],
  ['AIQ', 'AI Infrastructure'], ['ROBT', 'AI Infrastructure'],
  ['BOTZ', 'Robotics'], ['ROBO', 'Robotics'],
  ['QTUM', 'Quantum'],
  ['IGV', 'Software'],
  ['CIBR', 'Cybersecurity'], ['HACK', 'Cybersecurity'],
  ['MAGS', 'Hyperscalers'],
  ['OIH', 'Oil Services'], ['XLE', 'Oil & Gas'],
  ['NLR', 'Nuclear'], ['URA', 'Nuclear'],
  ['TAN', 'Solar'], ['GRID', 'Grid Infrastructure'], ['XLU', 'Power Generation'],
  ['SRVR', 'Data Center Infrastructure'], ['DTCR', 'Data Center Infrastructure'],
  ['SRVR', 'Neocloud/Data Center'], ['DTCR', 'Neocloud/Data Center'],
  ['GDX', 'Gold Miners'], ['GDXJ', 'Gold Miners'],
  ['SIL', 'Silver Miners'], ['SILJ', 'Silver Miners'],
  ['COPX', 'Copper'], ['SLX', 'Steel'],
  ['KBE', 'Banks'], ['KRE', 'Banks'],
  ['KCE', 'Capital Markets'], ['KIE', 'Insurance'],
  ['FINX', 'Fintech'],
  ['BITQ', 'Crypto'], ['IBIT', 'Crypto'],
  ['XLY', 'Consumer Growth'], ['XRT', 'Retail'],
  ['XLC', 'AdTech'], ['KWEB', 'China Internet'],
  ['ITA', 'Defense'], ['PPA', 'Defense'],
  ['ITA', 'Aerospace'], ['PPA', 'Aerospace'],
  ['UFO', 'Space'], ['ARKX', 'Space'],
  ['XBI', 'Biotechnology'], ['IBB', 'Biotechnology'],
  ['IHI', 'Medical Devices'], ['XLV', 'Healthcare'],
  ['XLI', 'Industrials'],
  ['ITB', 'Construction'], ['PAVE', 'Construction'],
];

// Map a *ticker* to the GICS sector it represents. Used to compute participation
// rate (breadth) — how many themes in a given sector beat SPY over the period.
// Keyed by ticker only; one ticker maps to one sector (the dominant exposure).
// Consumer Staples (XLP) and Real Estate (XLRE) intentionally have no themes —
// breadth is "thin" for those sectors by construction.
export const THEME_SECTORS = {
  // Technology
  SMH: 'Technology', SOXX: 'Technology', FIBR: 'Technology',
  AIQ: 'Technology', ROBT: 'Technology', BOTZ: 'Technology',
  ROBO: 'Technology', QTUM: 'Technology', IGV: 'Technology',
  CIBR: 'Technology', HACK: 'Technology', MAGS: 'Technology',
  SRVR: 'Technology', DTCR: 'Technology',
  // Energy
  OIH: 'Energy', XLE: 'Energy',
  // Utilities (nuclear / solar / grid cluster around XLU)
  NLR: 'Utilities', URA: 'Utilities', TAN: 'Utilities', GRID: 'Utilities', XLU: 'Utilities',
  // Materials
  GDX: 'Materials', GDXJ: 'Materials', SIL: 'Materials', SILJ: 'Materials',
  COPX: 'Materials', SLX: 'Materials',
  // Financials
  KBE: 'Financials', KRE: 'Financials', KCE: 'Financials',
  KIE: 'Financials', FINX: 'Financials', BITQ: 'Financials', IBIT: 'Financials',
  // Consumer Discretionary
  XLY: 'Consumer Discretionary', XRT: 'Consumer Discretionary',
  // Communication
  XLC: 'Communication', KWEB: 'Communication',
  // Industrials
  ITA: 'Industrials', PPA: 'Industrials', UFO: 'Industrials', ARKX: 'Industrials',
  XLI: 'Industrials', ITB: 'Industrials', PAVE: 'Industrials',
  // Health Care
  XBI: 'Health Care', IBB: 'Health Care', IHI: 'Health Care', XLV: 'Health Care',
};

// All unique tickers we need to pull a Yahoo chart for (benchmark + sectors + themes).
export function allTickers() {
  const set = new Set([BENCHMARK.ticker]);
  for (const sector of SECTORS) set.add(sector.ticker);
  for (const [ticker] of THEMES) set.add(ticker);
  return [...set];
}

// --- Pure computation helpers -------------------------------------------------

// Return the N-th element from the end of an array (1 = last, 2 = second to last).
// Returns undefined when the array is too short.
function nthFromEnd(arr, n) {
  if (!Array.isArray(arr) || arr.length < n) return undefined;
  return arr[arr.length - n];
}

// Relative volume: today's volume divided by the average of the previous 10
// trading days. Returns null when the data is too thin or non-finite.
export function computeRvol(volumes, lookback = 10) {
  if (!Array.isArray(volumes) || volumes.length < lookback + 1) return null;
  const today = volumes[volumes.length - 1];
  const window = volumes.slice(-(lookback + 1), -1);
  const finite = window.filter(Number.isFinite);
  if (!finite.length) return null;
  const avg = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  if (!Number.isFinite(today) || avg <= 0) return null;
  return today / avg;
}

// Period return from a closes series, in percent. `periodDays` is the number
// of trading days to look back from the latest close (1 = today vs yesterday,
// 5 = today vs ~1 week ago, 21 = ~1 month, 63 = ~3 months).
export function computeReturns(closes, periodDays) {
  if (!Array.isArray(closes) || closes.length < periodDays + 1) return null;
  const last = closes[closes.length - 1];
  const base = closes[closes.length - 1 - periodDays];
  if (!Number.isFinite(last) || !Number.isFinite(base) || base === 0) return null;
  return (last / base - 1) * 100;
}

// Map a closes series to an object with 1W, 1M, 3M returns (and the raw
// series length, useful for diagnostics). All values are percent; null when
// the data is too short for the longest period.
export function computePeriodReturns(closes) {
  return {
    return1w: computeReturns(closes, 5),
    return1m: computeReturns(closes, 21),
    return3m: computeReturns(closes, 63),
    bars: Array.isArray(closes) ? closes.length : 0,
  };
}

// Map a participation rate (0..1) to a breadth bucket. Thresholds:
//   broad  = >= 0.66 (most themes in the sector beat SPY)
//   mixed  = 0.33..0.66
//   thin   = < 0.33 (most themes lag)
export function classifyBreadth(rate) {
  if (!Number.isFinite(rate)) return 'unknown';
  if (rate >= 0.66) return 'broad';
  if (rate >= 0.33) return 'mixed';
  return 'thin';
}

// Compare a row's 1M return to SPY's 1M return. Thresholds:
//   vsSpy1m >= +1.0  -> "Leading"
//   vsSpy1m <= -1.0  -> "Lagging"
//   otherwise        -> "Inline"
export function directionVerdict(rowVsSpy) {
  if (!Number.isFinite(rowVsSpy)) return 'Unknown';
  if (rowVsSpy >= 1) return 'Leading';
  if (rowVsSpy <= -1) return 'Lagging';
  return 'Inline';
}

// Pull just the closing prices out of a Yahoo chart result, dropping nulls
// and NaNs. Defensive: Yahoo sometimes returns gaps for illiquid tickers.
export function extractCloses(chartResult) {
  const quotes = chartResult?.indicators?.quote?.[0];
  if (!quotes || !Array.isArray(quotes.close)) return [];
  return quotes.close.filter((value) => Number.isFinite(value));
}

export function extractVolumes(chartResult) {
  const quotes = chartResult?.indicators?.quote?.[0];
  if (!quotes || !Array.isArray(quotes.volume)) return [];
  return quotes.volume.filter((value) => Number.isFinite(value));
}

// Build a row for a single ticker from its chart result. The shape mirrors
// what the page renders: per-period returns, RVOL, and a "vs SPY" delta for
// the 1M anchor period. Shared by both route handlers (/api/flow and
// /api/flow/breadth) and exercised directly by scripts/smoke-flow.mjs so the
// smoke test runs the real logic rather than a copy.
export function buildRow(ticker, name, chart, spyReturn1m) {
  if (!chart) {
    return { ticker, name, return1w: null, return1m: null, return3m: null, rvol: null, vsSpy1m: null, unavailable: true };
  }
  const closes = extractCloses(chart);
  const volumes = extractVolumes(chart);
  const returns = computePeriodReturns(closes);
  const rvol = computeRvol(volumes, 10);
  const vsSpy1m = Number.isFinite(returns.return1m) && Number.isFinite(spyReturn1m)
    ? returns.return1m - spyReturn1m
    : null;
  return {
    ticker,
    name,
    return1w: returns.return1w,
    return1m: returns.return1m,
    return3m: returns.return3m,
    rvol,
    vsSpy1m,
    bars: returns.bars,
  };
}

// Group theme entries (from THEMES) by their sector via THEME_SECTORS. Themes
// whose ticker is not in the map are skipped — the map is the source of truth.
export function themesBySector() {
  const out = {};
  for (const sector of SECTORS) out[sector.name] = [];
  for (const [ticker, name] of THEMES) {
    const sectorName = THEME_SECTORS[ticker];
    if (!sectorName || !out[sectorName]) continue;
    out[sectorName].push({ ticker, name });
  }
  return out;
}
