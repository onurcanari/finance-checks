'use client';

import { useEffect, useState } from 'react';
import { Header, movement, percent, SourceBadge } from '../components';
import { DEPOSIT_AS_OF, DEPOSIT_RATE_ANNUAL, TUKFE_ANNUAL, TUKFE_AS_OF } from '../lib/tr-constants';

const realReturn = (nominal) => ((1 + nominal / 100) / (1 + TUKFE_ANNUAL / 100) - 1) * 100;

export default function Inflation() {
  const [data, setData] = useState(); const [error, setError] = useState(false); const [status, setStatus] = useState('CONNECTING...');
  const load = async () => { setStatus('FETCHING TR MACRO DATA...'); setError(false); try { const response = await fetch('/api/tr-macro', { cache: 'no-store' }); const snapshot = await response.json(); if (!response.ok) throw Error(snapshot.error); setData(snapshot); setStatus(`LIVE · ${new Date(snapshot.updatedAt).toLocaleTimeString('en-US')}`); } catch { setData(); setError(true); setStatus('LIVE DATA UNAVAILABLE'); } };
  useEffect(() => { load(); }, []);
  const withReal = (data ? data.rows : []).concat([{ symbol: 'DEPOSIT-TRY', label: 'BANK DEPOSIT', twelveMonthChange: DEPOSIT_RATE_ANNUAL, constant: true }]).map((row) => ({ ...row, real: realReturn(row.twelveMonthChange) }));
  const ready = Boolean(data);
  const best = withReal.reduce((a, b) => (b.real > a.real ? b : a), withReal[0]);
  const worst = withReal.reduce((a, b) => (b.real < a.real ? b : a), withReal[0]);
  const beating = withReal.filter((row) => row.real > 0).length;
  return <main className="shell inflation-page"><Header active="REAL RETURN" />
    <section className="panel read-panel"><div className="panel-title">REAL RETURN <span className="stamp">TRY ASSETS VS TUKFE</span></div><div className="market-read"><div><div className="eyebrow">INFLATION (TUKFE): <b className="down">{TUKFE_ANNUAL.toFixed(1)}%</b> <span className="mini">· as of {TUKFE_AS_OF}</span> <SourceBadge source={`manual constant, as of ${TUKFE_AS_OF}`} date={TUKFE_AS_OF} label="TUKFE annual inflation provenance" /></div></div>{ready ? <><div><div className="eyebrow">BEST REAL</div><b className={movement(best.real)}>{percent(best.real)}</b><span className="mini">{best.label}</span></div><div><div className="eyebrow">WORST REAL</div><b className={movement(worst.real)}>{percent(worst.real)}</b><span className="mini">{worst.label}</span></div><div><div className="eyebrow">BEATING TUKFE</div><b className={beating * 2 >= withReal.length ? 'up' : 'down'}>{beating} / {withReal.length}</b><span className="mini">assets positive</span></div><p className="market-copy">Real return leadership is in {best.label} ({percent(best.real)}); {worst.label} trails at {percent(worst.real)}.</p></> : <p className="market-copy">Loading TR macro data...</p>}</div></section>
    <section className="panel"><div className="panel-title">TRY REAL RETURNS <span className="stamp">12M NOMINAL VS 12M REAL</span></div><div className="table-wrap"><table><thead><tr><th>ASSET</th><th>12M NOMINAL</th><th>12M REAL</th></tr></thead><tbody>{ready ? withReal.map((row) => <tr key={row.symbol}><td><span className="ticker">{row.label}</span>{row.constant && <span className="mini">manual constant</span>}</td><td className={movement(row.twelveMonthChange)}>{percent(row.twelveMonthChange)} {row.constant ? <SourceBadge source={`manual constant, as of ${DEPOSIT_AS_OF}`} date={DEPOSIT_AS_OF} label="Bank deposit rate provenance" /> : <SourceBadge source={data.source} fetchedAt={data.updatedAt} label={`${row.label} market data`} />}</td><td className={movement(row.real)}>{percent(row.real)} <SourceBadge source={row.constant ? `manual constant, as of ${DEPOSIT_AS_OF}` : data.source} date={row.constant ? DEPOSIT_AS_OF : undefined} fetchedAt={row.constant ? undefined : data.updatedAt} label={`${row.label} real return provenance`} /></td></tr>) : <tr><td colSpan="3" className="market-empty">{error ? 'TR macro data unavailable.' : 'Loading TR macro data...'}</td></tr>}</tbody></table></div></section>
    <div className="status"><span><b className="up">●</b> TRY MACRO DATA</span><span>{status}</span><button onClick={load}>REFRESH</button></div><p className="foot">REAL RETURN = (1 + 12M NOMINAL) / (1 + TUKFE) - 1. NO SYNTHETIC VALUES.</p>
  </main>;
}
