'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header, formatPrice, movement, percent, SourceBadge } from '../components';
import { FED_FUNDS_RANGE, TCMB_POLICY_RATE, TR_CPI_INFLATION } from '../lib/rates-constants';

const isYield = (symbol) => symbol.startsWith('^');
const level = (row) => isYield(row.symbol) ? (Number.isFinite(row.value) ? `${row.value.toFixed(2)}%` : '-') : formatPrice(row.value);

export default function RatesPage() {
  const [data, setData] = useState(); const [status, setStatus] = useState('CONNECTING...');
  const load = async () => { setStatus('FETCHING LIVE RATES...'); try { const response = await fetch('/api/rates', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw Error(payload.error); setData(payload); setStatus(`LIVE · ${new Date(payload.updatedAt).toLocaleTimeString('en-US')}`); } catch { setData(undefined); setStatus('LIVE DATA UNAVAILABLE'); } };
  useEffect(() => { load(); }, []);
  const realRate = TCMB_POLICY_RATE - TR_CPI_INFLATION;
  const provenance = { source: data?.source, fetchedAt: data?.updatedAt };
  const constantBadge = { source: 'manual constant' };
  return <main className="shell rates-page"><Header active="RATES" stamp="RATES & BONDS / LIVE PRICE DATA" />
    <div className="rates-grid">
      <section className="panel"><div className="panel-title">RATES & BONDS <span className="stamp">LIVE PRICE DATA</span></div><div className="table-wrap"><table><thead><tr><th>INSTRUMENT</th><th>LEVEL</th><th>1D CHG</th></tr></thead><tbody>{data ? data.rates.map((row) => <tr key={row.symbol}><td><b>{row.label}</b><span className="mini">{row.symbol}</span></td><td>{level(row)} <SourceBadge {...provenance} label={`${row.label} level market data`} /></td><td className={movement(row.oneDay)}>{percent(row.oneDay)} <SourceBadge {...provenance} label={`${row.label} 1D market data`} /></td></tr>) : <tr><td colSpan="3" className="market-empty">{status === 'CONNECTING...' || status.startsWith('FETCHING') ? 'Loading live data...' : 'Live rate data unavailable.'}</td></tr>}</tbody></table></div></section>
      <aside className="panel policy-panel"><div className="panel-title">POLICY RATES <span className="stamp">MANUAL CONSTANTS</span></div><div className="policy-rows"><div><div className="eyebrow">TCMB POLICY RATE</div><div className="value">{TCMB_POLICY_RATE.toFixed(2)}% <SourceBadge {...constantBadge} label="TCMB one-week repo policy rate, manual constant" /></div></div><div><div className="eyebrow">FED FUNDS RANGE</div><div className="value">{FED_FUNDS_RANGE[0].toFixed(2)}% – {FED_FUNDS_RANGE[1].toFixed(2)}% <SourceBadge {...constantBadge} label="FOMC target range, manual constant" /></div></div><div><div className="eyebrow">REAL POLICY RATE (TR)</div><div className={`value ${movement(realRate)}`}>{realRate > 0 ? '+' : ''}{realRate.toFixed(2)}% <SourceBadge {...constantBadge} label="TCMB policy rate minus TUFE inflation, manual constant" /></div><span className="mini">policy rate minus TUFE inflation</span></div></div><p className="market-copy"><b className={movement(realRate)}>{realRate >= 0 ? 'CARRY FAVORS CASH/BONDS' : 'CARRY FAVORS RISK ASSETS'}</b></p></aside>
    </div>
    <div className="status"><span><b className="up">●</b> LIVE RATES DATA</span><span>{status}</span><button onClick={load}>REFRESH</button><Link href="/data">SOURCE NOTES →</Link></div><p className="foot">YIELD LEVELS IN % (CBOE/CME INDEX VALUES), DXY AS INDEX LEVEL. POLICY RATES ARE MANUAL CONSTANTS.</p>
  </main>;
}
