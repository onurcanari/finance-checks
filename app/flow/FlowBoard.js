'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Header, SourceBadge, movement, percent } from '../components';

const PERIODS = [
  { key: '1W', label: '1 Week', days: 5 },
  { key: '1M', label: '1 Month', days: 21 },
  { key: '3M', label: '3 Months', days: 63 },
];
const TYPES = [
  { key: 'sectors', label: 'Sectors' },
  { key: 'themes', label: 'Themes' },
  { key: 'both', label: 'Both' },
];

// Map a 1W/1M/3M key to the matching `return<period>` field on the API row.
// The route already computes all three; the board just picks the right one.
const PERIOD_FIELD = { '1W': 'return1w', '1M': 'return1m', '3M': 'return3m' };

function rvolChip(rvol) {
  if (!Number.isFinite(rvol)) return { label: '—', tone: 'muted' };
  if (rvol >= 2) return { label: `${rvol.toFixed(2)}×`, tone: 'high' };
  if (rvol >= 1.2) return { label: `${rvol.toFixed(2)}×`, tone: 'warm' };
  if (rvol < 0.5) return { label: `${rvol.toFixed(2)}×`, tone: 'cool' };
  return { label: `${rvol.toFixed(2)}×`, tone: 'neutral' };
}

function directionChip(vsSpy) {
  if (!Number.isFinite(vsSpy)) return { label: '—', tone: 'muted' };
  if (vsSpy >= 1) return { label: 'LEADING', tone: 'up' };
  if (vsSpy <= -1) return { label: 'LAGGING', tone: 'down' };
  return { label: 'INLINE', tone: 'muted' };
}

function breadthChip(breadth, label) {
  const text = label || (Number.isFinite(breadth) ? `${Math.round(breadth * 100)}%` : '—');
  if (label === 'broad') return { label: `BROAD · ${text}`, tone: 'broad' };
  if (label === 'mixed') return { label: `MIXED · ${text}`, tone: 'mixed' };
  if (label === 'thin') return { label: `THIN · ${text}`, tone: 'thin' };
  return { label: text, tone: 'muted' };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function rowValue(row, field) {
  return Number.isFinite(row?.[field]) ? row[field] : null;
}

export default function FlowBoard({ period: initialPeriod, type: initialType }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The server-rendered `initialPeriod` / `initialType` are the URL-of-record
  // for the first paint; subsequent toggles update the URL via router.replace
  // and re-fetch.
  const [period, setPeriod] = useState(initialPeriod);
  const [type, setType] = useState(initialType);
  const [flow, setFlow] = useState(null);
  const [breadth, setBreadth] = useState(null);
  const [status, setStatus] = useState('CONNECTING...');
  const [error, setError] = useState(null);

  const updateUrl = useCallback((next) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.period && next.period !== '1M') params.set('period', next.period); else params.delete('period');
    if (next.type && next.type !== 'both') params.set('type', next.type); else params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const load = useCallback(async (nextPeriod) => {
    setStatus('FETCHING LIVE DATA...');
    setError(null);
    try {
      const [flowRes, breadthRes] = await Promise.all([
        fetch('/api/flow', { cache: 'no-store' }),
        fetch('/api/flow/breadth', { cache: 'no-store' }),
      ]);
      if (!flowRes.ok) {
        const err = await flowRes.json().catch(() => ({}));
        throw new Error(err.error || `flow ${flowRes.status}`);
      }
      const flowPayload = await flowRes.json();
      const breadthPayload = breadthRes.ok ? await breadthRes.json().catch(() => null) : null;
      setFlow(flowPayload);
      setBreadth(breadthPayload);
      setStatus(`LIVE · ${new Date(flowPayload.generatedAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })} · ${nextPeriod}`);
    } catch (e) {
      setFlow(null);
      setBreadth(null);
      setError(e?.message || 'fetch failed');
      setStatus('LIVE DATA UNAVAILABLE');
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  const onPeriod = useCallback((next) => {
    setPeriod(next);
    updateUrl({ period: next, type });
  }, [type, updateUrl]);

  const onType = useCallback((next) => {
    setType(next);
    updateUrl({ period, type: next });
  }, [period, updateUrl]);

  // The flow rows already arrive ranked by vsSpy1m from the server (the
  // server uses the canonical 1M anchor). For 1W/3M, re-rank client-side
  // over the same payload so the toggle is instant.
  const field = PERIOD_FIELD[period] || PERIOD_FIELD['1M'];
  const rankedSectors = useMemo(() => {
    const rows = flow?.sectors || [];
    return [...rows].sort((a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity));
  }, [flow, field]);
  const rankedThemes = useMemo(() => {
    const rows = flow?.themes || [];
    return [...rows].sort((a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity));
  }, [flow, field]);

  const showSectors = type === 'sectors' || type === 'both';
  const showThemes = type === 'themes' || type === 'both';

  // --- Top strip --------------------------------------------------------
  // "Money in"  -> top 3 sectors by vsSpy over the active period
  // "Money out" -> bottom 3 sectors by vsSpy over the active period
  // "Most-hedged" -> sector or theme with the highest RVOL
  const strip = useMemo(() => {
    if (!flow) return null;
    const sortedByDelta = [...(flow.sectors || [])]
      .filter((row) => Number.isFinite(row[field]))
      .sort((a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity));
    const moneyIn = sortedByDelta.slice(0, 3);
    const moneyOut = sortedByDelta.slice(-3).reverse();
    const allRows = [...(flow.sectors || []), ...(flow.themes || [])];
    const topRvol = allRows
      .filter((row) => Number.isFinite(row.rvol))
      .sort((a, b) => (b.rvol ?? -Infinity) - (a.rvol ?? -Infinity))[0];
    return { moneyIn, moneyOut, topRvol };
  }, [flow, field]);

  const breadthByName = useMemo(() => {
    const map = new Map();
    for (const sector of breadth?.sectors || []) map.set(sector.ticker, sector);
    return map;
  }, [breadth]);

  const isEmpty = !flow;

  return (
    <>
      <section className="flow-controls panel">
        <div className="flow-controls-group">
          <span className="eyebrow">PERIOD</span>
          <div className="flow-periods" role="group" aria-label="Flow period">
            {PERIODS.map(({ key, label }) => (
              <button key={key} type="button" className={period === key ? 'active' : ''} aria-pressed={period === key} onClick={() => onPeriod(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flow-controls-group">
          <span className="eyebrow">VIEW</span>
          <div className="flow-types" role="group" aria-label="Flow type">
            {TYPES.map(({ key, label }) => (
              <button key={key} type="button" className={type === key ? 'active' : ''} aria-pressed={type === key} onClick={() => onType(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flow-controls-meta">
          <span className="live-pill" aria-live="polite"><b>●</b> {status}</span>
          <button type="button" onClick={() => load(period)}>REFRESH</button>
        </div>
      </section>

      {strip && (
        <section className="flow-strip panel" aria-label="Top flow strip">
          <div className="flow-strip-cell flow-strip-in">
            <div className="eyebrow">MONEY IN</div>
            <div className="flow-strip-tickers">
              {strip.moneyIn.length ? strip.moneyIn.map((row, index) => (
                <span key={row.ticker} className={movement(row[field])}>
                  <b>{row.ticker}</b>
                  <i>{formatPercent(row[field])}</i>
                  {index < strip.moneyIn.length - 1 ? ' / ' : ''}
                </span>
              )) : <span className="muted">NO LEADERS</span>}
            </div>
          </div>
          <div className="flow-strip-cell flow-strip-out">
            <div className="eyebrow">MONEY OUT</div>
            <div className="flow-strip-tickers">
              {strip.moneyOut.length ? strip.moneyOut.map((row, index) => (
                <span key={row.ticker} className={movement(row[field])}>
                  <b>{row.ticker}</b>
                  <i>{formatPercent(row[field])}</i>
                  {index < strip.moneyOut.length - 1 ? ' / ' : ''}
                </span>
              )) : <span className="muted">NO LAGGARDS</span>}
            </div>
          </div>
          <div className="flow-strip-cell flow-strip-hedge">
            <div className="eyebrow">MOST-HEDGED</div>
            <div className="flow-strip-tickers">
              {strip.topRvol ? (
                <span>
                  <b>{strip.topRvol.ticker}</b>
                  <i>{strip.topRvol.name}</i>
                  <em>RVOL {rvolChip(strip.topRvol.rvol).label}</em>
                </span>
              ) : <span className="muted">NO VOLUME SIGNAL</span>}
            </div>
          </div>
        </section>
      )}

      {isEmpty ? (
        <section className="panel flow-empty">
          <div className="panel-title"><span>FLOW DATA</span><span className="stamp">{error ? 'FETCH FAILED' : 'WAITING'}</span></div>
          <p className="empty-state">
            {error ? `Live flow data is unavailable. ${error}.` : 'Loading flow data...'}
          </p>
        </section>
      ) : (
        <div className="flow-grid">
          {showSectors && (
            <section className="panel flow-panel">
              <div className="panel-title">
                <span>SECTOR FLOW · 11 ETFs</span>
                <span className="stamp">RANKED vs SPY · {period}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">TICKER</th>
                      <th scope="col">SECTOR</th>
                      <th scope="col">{period} RETURN</th>
                      <th scope="col">vs SPY</th>
                      <th scope="col">RVOL</th>
                      <th scope="col">BREADTH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedSectors.map((row, index) => {
                      const breadth = breadthByName.get(row.ticker);
                      return (
                        <tr key={row.ticker} className={row.unavailable ? 'unavailable-row' : ''}>
                          <td><span className="flow-rank">{String(index + 1).padStart(2, '0')}</span></td>
                          <td><b>{row.ticker}</b> <SourceBadge source="yahoo" date={flow?.generatedAt} fetchedAt={flow?.generatedAt} label={`${row.ticker} sector flow data`} /></td>
                          <td>{row.name}</td>
                          <td className={row[field] != null ? movement(row[field]) : ''}>
                            {formatPercent(rowValue(row, field))}
                          </td>
                          <td>
                            <span className={`flow-chip flow-chip-${directionChip(row.vsSpy1m).tone}`}>
                              {directionChip(row.vsSpy1m).label} {Number.isFinite(row.vsSpy1m) ? formatPercent(row.vsSpy1m) : ''}
                            </span>
                          </td>
                          <td>
                            <span className={`flow-chip flow-chip-${rvolChip(row.rvol).tone}`}>
                              {rvolChip(row.rvol).label}
                            </span>
                          </td>
                          <td>
                            {breadth ? (
                              <span className={`flow-chip flow-chip-${breadthChip(breadth.breadth, breadth.breadthLabel).tone}`}>
                                {breadthChip(breadth.breadth, breadth.breadthLabel).label}
                              </span>
                            ) : <span className="flow-chip flow-chip-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showThemes && (
            <section className="panel flow-panel">
              <div className="panel-title">
                <span>THEME FLOW · {(flow.themes || []).length} ROWS</span>
                <span className="stamp">RANKED vs SPY · {period}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">TICKER</th>
                      <th scope="col">SUB-THEME</th>
                      <th scope="col">{period} RETURN</th>
                      <th scope="col">vs SPY</th>
                      <th scope="col">RVOL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedThemes.map((row, index) => (
                      <tr key={`${row.ticker}-${row.name}-${index}`} className={row.unavailable ? 'unavailable-row' : ''}>
                        <td><span className="flow-rank">{String(index + 1).padStart(2, '0')}</span></td>
                        <td><b>{row.ticker}</b> <SourceBadge source="yahoo" date={flow?.generatedAt} fetchedAt={flow?.generatedAt} label={`${row.ticker} ${row.name} theme flow data`} /></td>
                        <td>{row.name}</td>
                        <td className={row[field] != null ? movement(row[field]) : ''}>
                          {formatPercent(rowValue(row, field))}
                        </td>
                        <td>
                          <span className={`flow-chip flow-chip-${directionChip(row.vsSpy1m).tone}`}>
                            {directionChip(row.vsSpy1m).label} {Number.isFinite(row.vsSpy1m) ? formatPercent(row.vsSpy1m) : ''}
                          </span>
                        </td>
                        <td>
                          <span className={`flow-chip flow-chip-${rvolChip(row.rvol).tone}`}>
                            {rvolChip(row.rvol).label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      <p className="flow-foot">
        Data: Yahoo Finance chart API (3-month daily bars, range=3mo interval=1d). Returns are percent change over the selected window. RVOL = today&apos;s volume ÷ 10-day trailing average. Breadth = fraction of theme tickers in the sector whose 1M return beats SPY.
        {flow?.unavailable?.length ? ` Unavailable tickers: ${flow.unavailable.join(', ')}.` : ''}
      </p>
    </>
  );
}
